import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
import joblib
import os

def main():
    print("Starting model training pipeline...")
    dataset_path = r"c:\Users\sachi\OneDrive\Desktop\mule acc\DataSet.csv"
    if not os.path.exists(dataset_path):
        print(f"Error: Dataset not found at {dataset_path}")
        return

    print("Loading dataset...")
    df = pd.read_csv(dataset_path)
    print(f"Dataset shape: {df.shape}")

    # Separate features and target
    # Exclude index (Unnamed: 0), leakage (F3912), and label (F3924)
    # We also exclude F3888 (date) for simplicity
    target_col = 'F3924'
    leak_col = 'F3912'
    index_col = 'Unnamed: 0'
    date_col = 'F3888'

    X = df.drop(columns=[index_col, target_col, leak_col, date_col])
    y = df[target_col]

    # Identify categorical columns
    cat_cols = ['F2230', 'F3886', 'F3889', 'F3890', 'F3891', 'F3892', 'F3893']
    
    # Store categorical categories mapping for alignment in API
    cat_categories = {}
    for col in cat_cols:
        cat_categories[col] = list(X[col].dropna().unique())

    print("Encoding categorical columns...")
    X_encoded = pd.get_dummies(X, columns=cat_cols, drop_first=True)
    model_columns = list(X_encoded.columns)

    print("Imputing missing values...")
    imputer = SimpleImputer(strategy='median')
    X_imputed = imputer.fit_transform(X_encoded)

    print(f"Features dimension after encoding: {X_imputed.shape[1]}")
    print("Training Random Forest Classifier...")
    # Using 100 trees, balanced weights to handle the highly skewed class distribution (81 positive, 9001 negative)
    rf = RandomForestClassifier(
        n_estimators=100, 
        class_weight='balanced', 
        random_state=42, 
        n_jobs=-1
    )
    rf.fit(X_imputed, y)
    print("Model training complete.")

    # Calculate feature importances
    importances = rf.feature_importances_
    indices = np.argsort(importances)[::-1]
    
    feature_importances = []
    for f in range(50):  # Save top 50 features
        idx = indices[f]
        feature_importances.append({
            'feature': model_columns[idx],
            'importance': float(importances[idx])
        })

    # Create assets directory if not exists
    os.makedirs("backend", exist_ok=True)
    assets_path = os.path.join("backend", "model_assets.joblib")

    print(f"Saving model assets to {assets_path}...")
    assets = {
        'model': rf,
        'imputer': imputer,
        'model_columns': model_columns,
        'cat_cols': cat_cols,
        'cat_categories': cat_categories,
        'feature_importances': feature_importances
    }
    joblib.dump(assets, assets_path)
    print("Model assets saved successfully.")

if __name__ == "__main__":
    main()
