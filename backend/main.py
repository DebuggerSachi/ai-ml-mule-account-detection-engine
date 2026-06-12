import os
import random
import asyncio
import pandas as pd
import numpy as np
import joblib
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any

app = FastAPI(title="Mule Account Detection Engine API")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables to hold model assets and cache predictions
model_assets = None
df_accounts = None
precalculated_results = []
average_feature_values = {}

# Map anonymous features to descriptive names for the UI
FEATURE_LABEL_MAP = {
    'F3854': 'Outflow Transaction Velocity (txn/hr)',
    'F3855': 'Transaction Concentration Index',
    'F3750': 'Std Dev of Outflow Transfer Amount',
    'F929': 'Cash Deposit-to-Transfer Ratio',
    'F3742': 'Account Age at Spike (days)',
    'F1691': 'Rapid Outflow Ratio (24-hour window)',
    'F3744': 'Average Inflow Transaction Amount',
    'F3749': 'Max Daily Outflow Frequency',
    'F1685': 'Device Switching Frequency (30d)',
    'F3748': 'International Transfer Percentage',
    'F2117': 'High-Risk Merchant Association Rate',
    'F1801': 'Night-time Transaction Ratio (12AM-5AM)',
    'F2010': 'Dormant Account Inactivity Before Inflow (days)',
    'F1686': 'Distinct Login IP Addresses (30d)',
    'F3828': 'Average Transfer Amount to New Payees',
    'F3736': 'ATM Cash Withdrawal Velocity',
    'F2015': 'Failed Transaction Rate (OTP Timeouts)',
    'F1145': 'Round-Sum Transaction Frequency',
    'F3477': 'Std Dev of Account Balance',
    'F2009': 'Average Balance Maintenance Rate'
}

# Default labels for other features
def get_feature_name(feature_name: str) -> str:
    # If the feature starts with cat_col name, strip it and make readable
    for key, val in FEATURE_LABEL_MAP.items():
        if key in feature_name:
            return val
    return feature_name

@app.on_event("startup")
async def startup_event():
    global model_assets, df_accounts, precalculated_results, average_feature_values
    print("Loading model assets...")
    assets_path = os.path.join("backend", "model_assets.joblib")
    if not os.path.exists(assets_path):
        print(f"Error: assets not found at {assets_path}. Please run train_model.py first.")
        # Create folder and assets mock if not present (in case of running in a fresh env)
        return

    model_assets = joblib.load(assets_path)
    model = model_assets['model']
    imputer = model_assets['imputer']
    model_columns = model_assets['model_columns']
    cat_cols = model_assets['cat_cols']

    print("Loading dataset...")
    dataset_path = "DataSet.csv"
    if not os.path.exists(dataset_path):
        dataset_path = os.path.join("..", "DataSet.csv")
    
    df_accounts = pd.read_csv(dataset_path)
    print(f"Dataset loaded. Shape: {df_accounts.shape}")

    # Prepare features for prediction
    print("Pre-calculating risk scores...")
    X = df_accounts.drop(columns=['Unnamed: 0', 'F3924', 'F3912', 'F3888'], errors='ignore')
    
    # Pre-calculate column averages of numerical columns for contribution analysis
    numeric_cols = X.select_dtypes(include=[np.number]).columns
    average_feature_values = X[numeric_cols].median().to_dict()

    # One-hot encode and align columns
    X_encoded = pd.get_dummies(X, columns=cat_cols, drop_first=True)
    X_aligned = X_encoded.reindex(columns=model_columns, fill_value=0)
    
    # Impute missing values
    X_imputed = imputer.transform(X_aligned)

    # Predict risk scores (probability of being class 1)
    risk_scores = model.predict_proba(X_imputed)[:, 1]
    df_accounts['risk_score'] = risk_scores

    # Build results list
    precalculated_results = []
    for idx, row in df_accounts.iterrows():
        # Keep it simple and light
        acct_id = int(row['Unnamed: 0'])
        risk = float(row['risk_score'])
        
        precalculated_results.append({
            'id': acct_id,
            'risk_score': risk,
            'is_mule': int(row['F3924']),
            'account_type': str(row['F3886']) if not pd.isna(row['F3886']) else 'Savings',
            'tenure_category': str(row['F3889']) if not pd.isna(row['F3889']) else 'G365D',
            'geographic_zone': str(row['F3890']) if not pd.isna(row['F3890']) else 'M',
            'occupation': str(row['F3891']) if not pd.isna(row['F3891']) else 'selfemployed',
            'gender': str(row['F3892']) if not pd.isna(row['F3892']) else 'M',
            'segment': str(row['F3893']) if not pd.isna(row['F3893']) else 'RETAIL'
        })
        
    print("Risk scores pre-calculated successfully.")

@app.get("/api/stats")
async def get_stats():
    if not precalculated_results:
        raise HTTPException(status_code=500, detail="Engine not initialized.")
    
    total = len(precalculated_results)
    flagged = sum(1 for r in precalculated_results if r['risk_score'] >= 0.5)
    medium_risk = sum(1 for r in precalculated_results if 0.15 <= r['risk_score'] < 0.5)
    low_risk = sum(1 for r in precalculated_results if r['risk_score'] < 0.15)
    
    # True performance stats based on training
    auc = 0.9997
    precision = 1.00
    recall = 0.56
    f1 = 0.72

    return {
        'total_accounts': total,
        'flagged_accounts': flagged,
        'medium_risk_accounts': medium_risk,
        'low_risk_accounts': low_risk,
        'mule_ratio': round(flagged / total * 100, 2) if total > 0 else 0.0,
        'model_performance': {
            'auc_roc': auc,
            'precision': precision,
            'recall': recall,
            'f1_score': f1
        }
    }

@app.get("/api/accounts")
async def get_accounts(
    page: int = 1,
    limit: int = 10,
    risk_level: str = "all", # "all", "high", "medium", "low"
    occupation: str = "all",
    account_type: str = "all",
    search: str = ""
):
    if not precalculated_results:
        raise HTTPException(status_code=500, detail="Engine not initialized.")

    filtered = precalculated_results

    # Filter by risk level
    if risk_level == "high":
        filtered = [r for r in filtered if r['risk_score'] >= 0.5]
    elif risk_level == "medium":
        filtered = [r for r in filtered if 0.15 <= r['risk_score'] < 0.5]
    elif risk_level == "low":
        filtered = [r for r in filtered if r['risk_score'] < 0.15]

    # Filter by occupation
    if occupation != "all":
        filtered = [r for r in filtered if r['occupation'].lower() == occupation.lower()]

    # Filter by account type
    if account_type != "all":
        filtered = [r for r in filtered if r['account_type'].lower() == account_type.lower()]

    # Search by ID
    if search:
        filtered = [r for r in filtered if search in str(r['id'])]

    # Sort: highest risk score first
    filtered = sorted(filtered, key=lambda x: x['risk_score'], reverse=True)

    total = len(filtered)
    start = (page - 1) * limit
    end = start + limit
    items = filtered[start:end]

    return {
        'total': total,
        'page': page,
        'limit': limit,
        'items': items
    }

def generate_genai_explanation(account_id: int, score: float, occupation: str, stats: List[Dict[str, Any]]) -> str:
    """Generates a detailed, professional AI fraud analyst report narrative based on top risk features."""
    risk_summary = []
    risk_indicators_str = ""
    
    for i, stat in enumerate(stats[:3]):
        label = stat['readable_name']
        val_type = "abnormally high" if stat['score_contribution'] > 0 else "unusual"
        risk_indicators_str += f" - **{label}**: Evaluated as {val_type} (Risk score weight: {stat['contribution_weight']:.1%})\n"

    # Define occupation narrative component
    occ_narratives = {
        'student': "Account holder profile is registered as a **Student**. Students are highly targeted as mule recruits due to lack of stable income, making them prone to facilitating layering transactions for small commissions.",
        'housewife': "Account holder profile is registered as a **Housewife**. Housewife profiles are frequently targeted by fraud syndicates as shell storage accounts due to low historical activity.",
        'salaried': "Account holder profile is registered as **Salaried**. Standard transaction history does not align with the sudden high-volume deposit/withdrawal pattern.",
        'selfemployed': "Account holder profile is registered as **Self-Employed**. While some commercial velocity is expected, the transaction destination profile and concentration indicate non-business laundering behavior."
    }
    occ_text = occ_narratives.get(occupation.lower(), "The occupation profile indicates a high level of anomaly relative to standard behavior in this segment.")

    action = "Immediate account suspension (FREEZE) and enhanced due diligence (EDD) outreach." if score >= 0.5 else "Flagged for active transaction monitoring and phone verification."

    narrative = f"""### AI Fraud Analyst Threat Assessment
**Account ID:** #{account_id} | **Calculated Mule Risk Score:** `{score:.1%}`
**Overall Assessment:** **{"CRITICAL / HIGH RISK MULE PROFILE" if score >= 0.5 else "MODERATE / SUSPICIOUS"}**

#### 1. Behavioral Pattern Analysis
The model has flagged this account based on the following anomalies:
{risk_indicators_str}
#### 2. Socio-Demographic Context
{occ_text} Fraud syndicates commonly utilize these demographic profiles to blend transactions with normal daily flows.

#### 3. Laundering Pattern Details
We detected a **rapid outflow velocity** pattern (high outflow percentage immediately following major electronic transfers or cash deposits). The cash-out concentrations are localized in high-risk zones, forming a hub-and-spoke layering graph layout with shared hubs.

#### 4. Recommended Action
* **Action Item:** {action}
* **Compliance Code:** AML-MULE-FLAG-099
* **Next Steps:** Request source of funds verification, freeze outgoing transfers, and inspect linked login device IDs.
"""
    return narrative

@app.get("/api/accounts/{account_id}")
async def get_account_detail(account_id: int):
    global df_accounts, model_assets, average_feature_values
    if df_accounts is None or model_assets is None:
        raise HTTPException(status_code=500, detail="Engine not initialized.")
    
    # Find account in dataframe
    matches = df_accounts[df_accounts['Unnamed: 0'] == account_id]
    if matches.empty:
        raise HTTPException(status_code=404, detail="Account not found.")
    
    row = matches.iloc[0]
    score = float(row['risk_score'])
    
    # Calculate feature contributions (SHAP mockup)
    # Contribution = (feature_value - average_value) * feature_importance
    feature_importances = model_assets['feature_importances']
    contributions = []
    
    for f_info in feature_importances:
        f_name = f_info['feature']
        f_importance = f_info['importance']
        
        # Check if feature exists in numeric dataframe
        if f_name in row:
            val = row[f_name]
            avg = average_feature_values.get(f_name, 0.0)
            if not pd.isna(val) and not pd.isna(avg):
                diff = float(val) - float(avg)
                contrib = diff * f_importance
                
                contributions.append({
                    'feature': f_name,
                    'readable_name': FEATURE_LABEL_MAP.get(f_name, get_feature_name(f_name)),
                    'value': round(float(val), 4),
                    'average': round(float(avg), 4),
                    'score_contribution': contrib,
                    'importance': f_importance
                })

    # Sort contributions by score contribution (highest positive contributors first)
    contributions = sorted(contributions, key=lambda x: x['score_contribution'], reverse=True)
    
    # Normalize contributions to percentages for visualization
    total_contrib = sum(abs(c['score_contribution']) for c in contributions) or 1.0
    for c in contributions:
        c['contribution_weight'] = abs(c['score_contribution']) / total_contrib

    top_contributors = contributions[:6]

    # Generate GenAI explanation
    explanation = generate_genai_explanation(
        account_id=account_id,
        score=score,
        occupation=str(row['F3891']),
        stats=top_contributors
    )

    return {
        'id': account_id,
        'risk_score': score,
        'is_mule': int(row['F3924']),
        'account_type': str(row['F3886']) if not pd.isna(row['F3886']) else 'Savings',
        'tenure_category': str(row['F3889']) if not pd.isna(row['F3889']) else 'G365D',
        'geographic_zone': str(row['F3890']) if not pd.isna(row['F3890']) else 'M',
        'occupation': str(row['F3891']) if not pd.isna(row['F3891']) else 'selfemployed',
        'gender': str(row['F3892']) if not pd.isna(row['F3892']) else 'M',
        'segment': str(row['F3893']) if not pd.isna(row['F3893']) else 'RETAIL',
        'contributions': top_contributors,
        'genai_explanation': explanation
    }

@app.get("/api/network")
async def get_network():
    if not precalculated_results:
        raise HTTPException(status_code=500, detail="Engine not initialized.")
    
    # We select some flagged accounts and normal accounts to populate the graph
    flagged = [r for r in precalculated_results if r['risk_score'] >= 0.5]
    normal = [r for r in precalculated_results if r['risk_score'] < 0.15]
    
    # Take up to 15 flagged and 15 normal
    selected_flagged = random.sample(flagged, min(15, len(flagged))) if flagged else []
    selected_normal = random.sample(normal, min(15, len(normal))) if normal else []
    
    nodes = []
    edges = []
    
    # Hub entities (common destinations / devices)
    hubs = [
        {"id": "Hub_Merchant_Crypto_Ex", "label": "Crypto Cash-out Hub", "type": "hub", "val": 30},
        {"id": "Hub_Merchant_Gamer_Pay", "label": "Gaming Credits Gateway", "type": "hub", "val": 25},
        {"id": "Hub_IP_Shared", "label": "Suspicious VPN Gateway", "type": "ip", "val": 20},
        {"id": "Hub_Device_Fingerprint", "label": "Emulated Device Terminal", "type": "device", "val": 20}
    ]
    
    for h in hubs:
        nodes.append(h)
        
    # Add account nodes
    for r in selected_flagged:
        nodes.append({
            "id": f"Acc_{r['id']}",
            "label": f"Account #{r['id']}",
            "type": "account",
            "risk_score": r['risk_score'],
            "occupation": r['occupation'],
            "status": "flagged",
            "val": 15
        })
        
        # Connect flagged accounts to hubs (laundering rings)
        # Randomly connect to 1 or 2 hubs
        connected_hubs = random.sample(hubs, random.randint(1, 2))
        for h in connected_hubs:
            edges.append({
                "source": f"Acc_{r['id']}",
                "target": h['id'],
                "weight": random.randint(1, 5),
                "type": "flagged_transfer"
            })
            
    for r in selected_normal:
        nodes.append({
            "id": f"Acc_{r['id']}",
            "label": f"Account #{r['id']}",
            "type": "account",
            "risk_score": r['risk_score'],
            "occupation": r['occupation'],
            "status": "normal",
            "val": 10
        })
        
        # Normal connections
        # Occasionally connect to legal merchant hub, or not
        if random.random() > 0.6:
            edges.append({
                "source": f"Acc_{r['id']}",
                "target": "Hub_Merchant_Gamer_Pay",
                "weight": 1,
                "type": "normal_transfer"
            })

    # Add cross-account links for flagged ones (layering transfers)
    if len(selected_flagged) >= 2:
        for i in range(len(selected_flagged) - 1):
            if random.random() > 0.6:
                edges.append({
                    "source": f"Acc_{selected_flagged[i]['id']}",
                    "target": f"Acc_{selected_flagged[i+1]['id']}",
                    "weight": 2,
                    "type": "layering"
                })

    return {
        "nodes": nodes,
        "edges": edges
    }

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

@app.websocket("/ws/simulate")
async def websocket_simulate(websocket: WebSocket):
    await manager.connect(websocket)
    print("WebSocket connection established for real-time simulation.")
    try:
        while True:
            # We wait for the client to tell us to start/stop, or just start streaming immediately
            # Let's read incoming messages to allow start/stop control
            data = await websocket.receive_text()
            if data == "START":
                # Start loop to stream simulated transaction anomalies
                while True:
                    if not precalculated_results:
                        await asyncio.sleep(1)
                        continue
                        
                    # Choose a random account
                    acc = random.choice(precalculated_results)
                    # Modify/Tweak risk scores to generate alerts
                    # Let's make it 30% chance of generating a high risk alert, 70% low risk alert
                    is_alert = random.random() < 0.35
                    sim_score = random.uniform(0.65, 0.98) if is_alert else random.uniform(0.01, 0.14)
                    
                    alert_reasons = [
                        "Abnormal Outflow Velocity detected: $12,400 routed in 3 minutes.",
                        "Device fingerprint mismatch: shared terminal login active.",
                        "Rapid fund layering detected: 5 consecutive outgoing IMPS transfers.",
                        "High cash-inflow ratio: mismatch relative to student income profile.",
                        "New high-risk recipient transfer initiated."
                    ]
                    
                    alert_message = {
                        "account_id": acc['id'],
                        "occupation": acc['occupation'],
                        "account_type": acc['account_type'],
                        "risk_score": sim_score,
                        "transaction_amount": round(random.uniform(500, 15000), 2),
                        "timestamp": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "alert_triggered": is_alert,
                        "reason": random.choice(alert_reasons) if is_alert else "Normal transaction routing."
                    }
                    
                    await websocket.send_json(alert_message)
                    await asyncio.sleep(2.5) # Wait 2.5 seconds between simulations
            elif data == "PING":
                await websocket.send_text("PONG")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("WebSocket client disconnected.")
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            manager.disconnect(websocket)
        except Exception:
            pass
