# AI/ML Mule Account Detection Engine

## Overview

The AI/ML Mule Account Detection Engine is an intelligent fraud detection platform designed to identify suspicious bank accounts involved in money laundering and fraudulent fund transfers.

The system analyzes transactional and behavioral patterns to classify accounts as legitimate or potential mule accounts, helping financial institutions reduce fraud losses and improve compliance.

---

## Problem Statement

Financial fraud schemes frequently use mule accounts to receive, transfer, and conceal illegally obtained funds.

Traditional rule-based monitoring systems often:

* Generate large numbers of false positives
* Fail to detect evolving fraud patterns
* Struggle with identifying hidden transaction networks

This project leverages Machine Learning and Explainable AI concepts to improve fraud detection efficiency.

---

## Features

### Risk Scoring Engine

* Predicts mule account probability using Machine Learning
* Generates account-level risk scores
* Categorizes accounts into risk levels

### Explainable AI

* Provides human-readable explanations for flagged accounts
* Highlights the most influential risk indicators

### Real-Time Monitoring Simulation

* Live transaction alert simulation using WebSockets
* Dynamic risk updates

### Interactive Dashboard

* Risk analytics
* Account monitoring
* Alert management
* Network visualization

### Graph Intelligence Concepts

* Fan-in and fan-out analysis
* Suspicious relationship visualization
* Transaction network monitoring

---

## Technology Stack

### Backend

* Python
* FastAPI
* Scikit-Learn
* Pandas
* Joblib

### Machine Learning

* Random Forest Classifier

### Frontend

* React
* Vite
* Recharts
* Vanilla CSS

### Future Enhancements

* XGBoost
* LightGBM
* Isolation Forest
* Neo4j Graph Database
* Apache Kafka
* Redis Feature Store

---

## Architecture

Dataset
→ Feature Engineering
→ Random Forest Model
→ Risk Scoring
→ Explainability Layer
→ Dashboard Visualization

---

## Project Structure

backend/

* main.py
* train_model.py
* model_assets.joblib

frontend/

* React dashboard
* Charts and visualizations
* Risk monitoring interface

---

## Machine Learning Approach

The current implementation uses a Random Forest Classifier trained on engineered account features.

The model:

* Learns historical fraud patterns
* Predicts mule-account likelihood
* Produces probability-based risk scores
* Supports explainability through feature importance analysis

---

## Running the Project

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Future Roadmap

* Real-time transaction ingestion
* Advanced anomaly detection
* Graph-based fraud intelligence
* Neo4j integration
* Streaming analytics
* Production-grade deployment pipeline

---

## Author

Sachi Mishra

AI/ML Mule Account Detection Engine
