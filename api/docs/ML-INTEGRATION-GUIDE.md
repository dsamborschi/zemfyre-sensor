# Machine Learning Integration Guide

**Adding ML-Based Anomaly Detection & Predictive Analytics**

This guide shows how to enhance the Digital Twin system with machine learning for:
- Advanced anomaly detection (Isolation Forest, LSTM)
- Predictive maintenance
- Time-series forecasting
- Pattern recognition

---

## 🎯 ML Use Cases for IoT Digital Twins

### 1. **Anomaly Detection** (Unsupervised)
- **Current**: Z-score (statistical method)
- **ML Upgrade**: Isolation Forest, Autoencoders, One-Class SVM
- **Advantage**: Detects complex patterns, multi-dimensional anomalies

### 2. **Time-Series Forecasting** (Supervised)
- **Goal**: Predict future values (next hour, next day)
- **Models**: LSTM, Prophet, ARIMA
- **Use Case**: Predict CPU usage, anticipate resource shortages

### 3. **Predictive Maintenance** (Classification)
- **Goal**: Predict device failures before they happen
- **Models**: Random Forest, XGBoost
- **Use Case**: "Device likely to fail in next 24 hours"

### 4. **Pattern Recognition** (Clustering)
- **Goal**: Group similar devices, detect behavior changes
- **Models**: K-Means, DBSCAN
- **Use Case**: "Device behavior has deviated from its cluster"

---

## 🚀 Quick Start: Python ML Service

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Digital Twin API (TypeScript/Node.js)                  │
│  - Stores device shadows in PostgreSQL                  │
│  - Exposes REST API                                     │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ├─ HTTP REST API
                  │
┌─────────────────▼───────────────────────────────────────┐
│  ML Service (Python/FastAPI)                            │
│  - Trains models on historical data                     │
│  - Real-time predictions via API                        │
│  - Scheduled retraining jobs                            │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ├─ PostgreSQL (shared database)
                  │
┌─────────────────▼───────────────────────────────────────┐
│  ML Models (Scikit-learn, TensorFlow, PyTorch)         │
│  - Isolation Forest (anomaly detection)                 │
│  - LSTM (time-series forecasting)                       │
│  - XGBoost (predictive maintenance)                     │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack

```python
# Core ML Libraries
- scikit-learn     # Traditional ML (Isolation Forest, Random Forest)
- tensorflow       # Deep learning (LSTM, Autoencoders)
- pytorch          # Alternative deep learning
- prophet          # Time-series forecasting (Facebook)
- xgboost          # Gradient boosting

# API Framework
- FastAPI          # High-performance Python API
- pydantic         # Data validation
- uvicorn          # ASGI server

# Data Processing
- pandas           # Data manipulation
- numpy            # Numerical computing
- psycopg2         # PostgreSQL connector
```

---

## 📦 Project Structure

```
zemfyre-sensor/
├── api/                          # Existing Node.js API
├── ml-service/                   # NEW: Python ML Service
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                   # FastAPI app
│   ├── config.py                 # Configuration
│   ├── models/                   # ML models
│   │   ├── __init__.py
│   │   ├── isolation_forest.py   # Anomaly detection
│   │   ├── lstm_forecast.py      # Time-series prediction
│   │   ├── predictive_maintenance.py
│   │   └── model_registry.py     # Model versioning
│   ├── services/                 # Business logic
│   │   ├── data_fetcher.py       # Fetch from PostgreSQL
│   │   ├── trainer.py            # Model training
│   │   └── predictor.py          # Real-time prediction
│   ├── routers/                  # API routes
│   │   ├── anomalies.py
│   │   ├── forecasts.py
│   │   └── predictions.py
│   └── tests/
└── docker-compose.yml            # Add ml-service container
```

---

## 🔧 Implementation: ML Service

### Step 1: Create ML Service Directory

```bash
mkdir ml-service
cd ml-service
```

### Step 2: `requirements.txt`

```txt
# API Framework
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.4.2
pydantic-settings==2.0.3

# ML Libraries
scikit-learn==1.3.2
tensorflow==2.15.0
xgboost==2.0.2
prophet==1.1.5

# Data Processing
pandas==2.1.3
numpy==1.26.2
psycopg2-binary==2.9.9

# Utilities
joblib==1.3.2           # Model serialization
python-dateutil==2.8.2
pytz==2023.3

# Monitoring
prometheus-client==0.19.0
```

### Step 3: `config.py`

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "iotistic"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    
    # ML Service
    ML_SERVICE_PORT: int = 5000
    ML_SERVICE_HOST: str = "0.0.0.0"
    
    # Model Configuration
    MODEL_DIR: str = "./models/saved"
    RETRAIN_INTERVAL_HOURS: int = 24
    MIN_TRAINING_SAMPLES: int = 100
    
    # Anomaly Detection
    ISOLATION_FOREST_CONTAMINATION: float = 0.01  # 1% expected anomalies
    ISOLATION_FOREST_N_ESTIMATORS: int = 100
    
    # Time-Series Forecasting
    LSTM_SEQUENCE_LENGTH: int = 50  # Use last 50 points
    LSTM_FORECAST_HORIZON: int = 12  # Predict next 12 points
    LSTM_EPOCHS: int = 50
    LSTM_BATCH_SIZE: int = 32
    
    class Config:
        env_file = ".env"

settings = Settings()
```

### Step 4: `services/data_fetcher.py`

```python
import psycopg2
import pandas as pd
from datetime import datetime, timedelta
from config import settings

class DataFetcher:
    def __init__(self):
        self.connection = None
    
    def connect(self):
        """Connect to PostgreSQL"""
        self.connection = psycopg2.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            database=settings.DB_NAME,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD
        )
    
    def close(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()
    
    def fetch_device_history(
        self, 
        device_uuid: str, 
        field: str, 
        hours: int = 168  # 7 days default
    ) -> pd.DataFrame:
        """
        Fetch historical data for ML training/prediction
        
        Returns DataFrame with columns: timestamp, value
        """
        query = """
            SELECT 
                timestamp,
                (reported_state->>%s)::float as value
            FROM device_shadow_history
            WHERE device_uuid = %s
                AND timestamp >= NOW() - INTERVAL '%s hours'
                AND reported_state->>%s IS NOT NULL
            ORDER BY timestamp ASC
        """
        
        # Extract nested field (e.g., "system.cpuUsage" -> extract from JSONB)
        field_parts = field.split('.')
        jsonb_path = '{' + ','.join(field_parts) + '}'
        
        query_with_jsonb = """
            SELECT 
                timestamp,
                (reported_state #>> %s)::float as value
            FROM device_shadow_history
            WHERE device_uuid = %s
                AND timestamp >= NOW() - INTERVAL '%s hours'
                AND reported_state #>> %s IS NOT NULL
            ORDER BY timestamp ASC
        """
        
        df = pd.read_sql_query(
            query_with_jsonb,
            self.connection,
            params=(jsonb_path, device_uuid, str(hours), jsonb_path)
        )
        
        return df
    
    def fetch_all_devices_current_state(self) -> pd.DataFrame:
        """Fetch current state for all devices"""
        query = """
            SELECT 
                device_uuid,
                device_name,
                (reported_state->>'system')::jsonb as system_metrics,
                last_updated,
                status
            FROM device_shadows
            WHERE status = 'online'
        """
        
        return pd.read_sql_query(query, self.connection)
    
    def fetch_multi_metric_history(
        self, 
        device_uuid: str, 
        hours: int = 168
    ) -> pd.DataFrame:
        """
        Fetch multiple metrics for multivariate ML models
        
        Returns DataFrame with columns: timestamp, cpu, memory, disk, etc.
        """
        query = """
            SELECT 
                timestamp,
                (reported_state#>>'{system,cpuUsage}')::float as cpu_usage,
                (reported_state#>>'{system,memoryUsed}')::float as memory_used,
                (reported_state#>>'{system,memoryTotal}')::float as memory_total,
                (reported_state#>>'{system,diskUsed}')::float as disk_used,
                (reported_state#>>'{system,diskTotal}')::float as disk_total,
                (reported_state#>>'{system,uptime}')::float as uptime,
                (reported_state#>>'{network,bytesReceived}')::float as bytes_received,
                (reported_state#>>'{network,bytesSent}')::float as bytes_sent
            FROM device_shadow_history
            WHERE device_uuid = %s
                AND timestamp >= NOW() - INTERVAL '%s hours'
            ORDER BY timestamp ASC
        """
        
        df = pd.read_sql_query(
            query,
            self.connection,
            params=(device_uuid, str(hours))
        )
        
        # Calculate derived features
        df['memory_usage_percent'] = (df['memory_used'] / df['memory_total']) * 100
        df['disk_usage_percent'] = (df['disk_used'] / df['disk_total']) * 100
        df['network_total'] = df['bytes_received'] + df['bytes_sent']
        
        return df
```

### Step 5: `models/isolation_forest.py`

```python
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib
from pathlib import Path
from config import settings

class IsolationForestAnomalyDetector:
    """
    Isolation Forest for multivariate anomaly detection
    Better than Z-score for complex patterns
    """
    
    def __init__(self, contamination: float = None):
        self.contamination = contamination or settings.ISOLATION_FOREST_CONTAMINATION
        self.model = None
        self.scaler = StandardScaler()
        self.feature_names = None
    
    def train(self, df: pd.DataFrame, features: list[str]):
        """
        Train Isolation Forest on historical data
        
        Args:
            df: DataFrame with feature columns
            features: List of column names to use as features
        """
        self.feature_names = features
        
        # Extract and scale features
        X = df[features].values
        X_scaled = self.scaler.fit_transform(X)
        
        # Train model
        self.model = IsolationForest(
            n_estimators=settings.ISOLATION_FOREST_N_ESTIMATORS,
            contamination=self.contamination,
            random_state=42,
            n_jobs=-1  # Use all CPU cores
        )
        
        self.model.fit(X_scaled)
        
        print(f"✅ Isolation Forest trained on {len(df)} samples")
        print(f"   Features: {', '.join(features)}")
    
    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Predict anomalies
        
        Returns DataFrame with columns: timestamp, is_anomaly, anomaly_score
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")
        
        X = df[self.feature_names].values
        X_scaled = self.scaler.transform(X)
        
        # Predict: -1 = anomaly, 1 = normal
        predictions = self.model.predict(X_scaled)
        
        # Anomaly score: lower = more anomalous
        scores = self.model.score_samples(X_scaled)
        
        result_df = df[['timestamp']].copy()
        result_df['is_anomaly'] = predictions == -1
        result_df['anomaly_score'] = scores
        
        # Add severity based on score
        score_threshold_critical = np.percentile(scores, 1)  # Bottom 1%
        result_df['severity'] = result_df.apply(
            lambda row: 'critical' if row['anomaly_score'] < score_threshold_critical 
            else 'warning' if row['is_anomaly'] 
            else 'normal',
            axis=1
        )
        
        return result_df
    
    def save(self, device_uuid: str):
        """Save model to disk"""
        model_dir = Path(settings.MODEL_DIR) / 'isolation_forest'
        model_dir.mkdir(parents=True, exist_ok=True)
        
        model_path = model_dir / f"{device_uuid}_model.joblib"
        scaler_path = model_dir / f"{device_uuid}_scaler.joblib"
        
        joblib.dump(self.model, model_path)
        joblib.dump(self.scaler, scaler_path)
        
        # Save metadata
        metadata = {
            'feature_names': self.feature_names,
            'contamination': self.contamination,
            'trained_at': pd.Timestamp.now().isoformat()
        }
        joblib.dump(metadata, model_dir / f"{device_uuid}_metadata.joblib")
        
        print(f"✅ Model saved: {model_path}")
    
    def load(self, device_uuid: str):
        """Load model from disk"""
        model_dir = Path(settings.MODEL_DIR) / 'isolation_forest'
        
        model_path = model_dir / f"{device_uuid}_model.joblib"
        scaler_path = model_dir / f"{device_uuid}_scaler.joblib"
        metadata_path = model_dir / f"{device_uuid}_metadata.joblib"
        
        if not model_path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")
        
        self.model = joblib.load(model_path)
        self.scaler = joblib.load(scaler_path)
        metadata = joblib.load(metadata_path)
        self.feature_names = metadata['feature_names']
        
        print(f"✅ Model loaded: {model_path}")
```

### Step 6: `models/lstm_forecast.py`

```python
import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout
from sklearn.preprocessing import MinMaxScaler
from pathlib import Path
from config import settings

class LSTMForecaster:
    """
    LSTM Neural Network for time-series forecasting
    Predicts future values based on historical patterns
    """
    
    def __init__(
        self, 
        sequence_length: int = None, 
        forecast_horizon: int = None
    ):
        self.sequence_length = sequence_length or settings.LSTM_SEQUENCE_LENGTH
        self.forecast_horizon = forecast_horizon or settings.LSTM_FORECAST_HORIZON
        self.model = None
        self.scaler = MinMaxScaler(feature_range=(0, 1))
    
    def prepare_sequences(self, data: np.ndarray):
        """
        Create sequences for LSTM training
        
        Example: sequence_length=50, forecast_horizon=12
        Input: [t-49, t-48, ..., t-1, t]
        Output: [t+1, t+2, ..., t+12]
        """
        X, y = [], []
        
        for i in range(len(data) - self.sequence_length - self.forecast_horizon):
            X.append(data[i:i + self.sequence_length])
            y.append(data[i + self.sequence_length:i + self.sequence_length + self.forecast_horizon])
        
        return np.array(X), np.array(y)
    
    def train(self, df: pd.DataFrame, value_column: str = 'value'):
        """
        Train LSTM model
        
        Args:
            df: DataFrame with timestamp and value columns
            value_column: Name of the column to predict
        """
        # Extract and scale values
        values = df[value_column].values.reshape(-1, 1)
        scaled_values = self.scaler.fit_transform(values)
        
        # Create sequences
        X, y = self.prepare_sequences(scaled_values)
        
        if len(X) < settings.MIN_TRAINING_SAMPLES:
            raise ValueError(
                f"Not enough data. Need {settings.MIN_TRAINING_SAMPLES}, got {len(X)}"
            )
        
        # Split train/validation (80/20)
        split_idx = int(len(X) * 0.8)
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]
        
        # Build LSTM model
        self.model = Sequential([
            LSTM(128, activation='relu', return_sequences=True, 
                 input_shape=(self.sequence_length, 1)),
            Dropout(0.2),
            LSTM(64, activation='relu', return_sequences=False),
            Dropout(0.2),
            Dense(32, activation='relu'),
            Dense(self.forecast_horizon)  # Predict multiple future points
        ])
        
        self.model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
            loss='mse',
            metrics=['mae']
        )
        
        # Train
        history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=settings.LSTM_EPOCHS,
            batch_size=settings.LSTM_BATCH_SIZE,
            verbose=1
        )
        
        print(f"✅ LSTM trained on {len(X_train)} sequences")
        print(f"   Final Loss: {history.history['loss'][-1]:.4f}")
        print(f"   Val Loss: {history.history['val_loss'][-1]:.4f}")
    
    def predict(self, recent_data: pd.DataFrame, value_column: str = 'value'):
        """
        Predict future values
        
        Args:
            recent_data: Last N data points (where N = sequence_length)
        
        Returns:
            DataFrame with columns: timestamp, predicted_value, confidence_interval
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")
        
        # Get last sequence_length points
        values = recent_data[value_column].values[-self.sequence_length:]
        
        if len(values) < self.sequence_length:
            raise ValueError(
                f"Need {self.sequence_length} recent points, got {len(values)}"
            )
        
        # Scale and reshape
        scaled_values = self.scaler.transform(values.reshape(-1, 1))
        X = scaled_values.reshape(1, self.sequence_length, 1)
        
        # Predict
        scaled_predictions = self.model.predict(X, verbose=0)
        predictions = self.scaler.inverse_transform(scaled_predictions.reshape(-1, 1))
        
        # Generate future timestamps (assuming 60s interval)
        last_timestamp = recent_data['timestamp'].iloc[-1]
        future_timestamps = pd.date_range(
            start=last_timestamp,
            periods=self.forecast_horizon + 1,
            freq='60S'
        )[1:]  # Exclude the start timestamp
        
        # Create result DataFrame
        result_df = pd.DataFrame({
            'timestamp': future_timestamps,
            'predicted_value': predictions.flatten()
        })
        
        # Add confidence interval (simple approach: ±10% based on recent stddev)
        recent_std = recent_data[value_column].std()
        result_df['confidence_lower'] = result_df['predicted_value'] - recent_std
        result_df['confidence_upper'] = result_df['predicted_value'] + recent_std
        
        return result_df
    
    def save(self, device_uuid: str):
        """Save model to disk"""
        model_dir = Path(settings.MODEL_DIR) / 'lstm'
        model_dir.mkdir(parents=True, exist_ok=True)
        
        model_path = model_dir / f"{device_uuid}_lstm.h5"
        self.model.save(model_path)
        
        # Save scaler
        import joblib
        scaler_path = model_dir / f"{device_uuid}_scaler.joblib"
        joblib.dump(self.scaler, scaler_path)
        
        print(f"✅ LSTM model saved: {model_path}")
    
    def load(self, device_uuid: str):
        """Load model from disk"""
        model_dir = Path(settings.MODEL_DIR) / 'lstm'
        
        model_path = model_dir / f"{device_uuid}_lstm.h5"
        scaler_path = model_dir / f"{device_uuid}_scaler.joblib"
        
        if not model_path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")
        
        self.model = load_model(model_path)
        
        import joblib
        self.scaler = joblib.load(scaler_path)
        
        print(f"✅ LSTM model loaded: {model_path}")
```

### Step 7: `routers/anomalies.py` (FastAPI Routes)

```python
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timedelta
from services.data_fetcher import DataFetcher
from models.isolation_forest import IsolationForestAnomalyDetector

router = APIRouter(prefix="/ml/anomalies", tags=["ML Anomaly Detection"])

class AnomalyResponse(BaseModel):
    device_uuid: str
    timestamp: datetime
    is_anomaly: bool
    anomaly_score: float
    severity: str

@router.post("/train/{device_uuid}")
async def train_anomaly_detector(
    device_uuid: str,
    hours: int = Query(default=168, description="Hours of historical data")
):
    """
    Train Isolation Forest model for a device
    """
    try:
        # Fetch data
        fetcher = DataFetcher()
        fetcher.connect()
        
        df = fetcher.fetch_multi_metric_history(device_uuid, hours=hours)
        fetcher.close()
        
        if len(df) < 100:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough data. Need 100+ samples, got {len(df)}"
            )
        
        # Train model
        features = ['cpu_usage', 'memory_usage_percent', 'disk_usage_percent', 'network_total']
        detector = IsolationForestAnomalyDetector()
        detector.train(df, features)
        
        # Save model
        detector.save(device_uuid)
        
        return {
            "message": "Model trained successfully",
            "device_uuid": device_uuid,
            "training_samples": len(df),
            "features": features
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/detect/{device_uuid}")
async def detect_anomalies(
    device_uuid: str,
    hours: int = Query(default=24, description="Hours of data to analyze")
):
    """
    Detect anomalies using trained Isolation Forest model
    """
    try:
        # Load model
        detector = IsolationForestAnomalyDetector()
        detector.load(device_uuid)
        
        # Fetch recent data
        fetcher = DataFetcher()
        fetcher.connect()
        df = fetcher.fetch_multi_metric_history(device_uuid, hours=hours)
        fetcher.close()
        
        # Predict
        results = detector.predict(df)
        
        # Filter only anomalies
        anomalies = results[results['is_anomaly']].to_dict('records')
        
        return {
            "device_uuid": device_uuid,
            "analyzed_points": len(results),
            "anomalies_detected": len(anomalies),
            "anomalies": anomalies[:50]  # Return top 50
        }
    
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Model not trained. Call /train endpoint first."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 8: `routers/forecasts.py`

```python
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime
from services.data_fetcher import DataFetcher
from models.lstm_forecast import LSTMForecaster

router = APIRouter(prefix="/ml/forecasts", tags=["ML Time-Series Forecasting"])

class ForecastResponse(BaseModel):
    timestamp: datetime
    predicted_value: float
    confidence_lower: float
    confidence_upper: float

@router.post("/train/{device_uuid}")
async def train_forecaster(
    device_uuid: str,
    field: str = Query(default="system.cpuUsage"),
    hours: int = Query(default=168)
):
    """
    Train LSTM forecaster for a specific metric
    """
    try:
        # Fetch data
        fetcher = DataFetcher()
        fetcher.connect()
        df = fetcher.fetch_device_history(device_uuid, field, hours=hours)
        fetcher.close()
        
        if len(df) < 100:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough data. Need 100+ samples, got {len(df)}"
            )
        
        # Train LSTM
        forecaster = LSTMForecaster()
        forecaster.train(df, value_column='value')
        
        # Save model
        forecaster.save(device_uuid)
        
        return {
            "message": "LSTM model trained successfully",
            "device_uuid": device_uuid,
            "field": field,
            "training_samples": len(df)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/predict/{device_uuid}")
async def predict_future(
    device_uuid: str,
    field: str = Query(default="system.cpuUsage")
):
    """
    Predict future values using trained LSTM model
    """
    try:
        # Load model
        forecaster = LSTMForecaster()
        forecaster.load(device_uuid)
        
        # Fetch recent data for prediction
        fetcher = DataFetcher()
        fetcher.connect()
        df = fetcher.fetch_device_history(device_uuid, field, hours=2)  # Last 2 hours
        fetcher.close()
        
        # Predict
        predictions = forecaster.predict(df, value_column='value')
        
        return {
            "device_uuid": device_uuid,
            "field": field,
            "predictions": predictions.to_dict('records')
        }
    
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Model not trained. Call /train endpoint first."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 9: `main.py` (FastAPI App)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import anomalies, forecasts
from config import settings

app = FastAPI(
    title="IoT ML Service",
    description="Machine Learning service for Digital Twin anomaly detection and forecasting",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(anomalies.router)
app.include_router(forecasts.router)

@app.get("/")
async def root():
    return {
        "service": "IoT ML Service",
        "version": "1.0.0",
        "endpoints": {
            "anomalies": "/ml/anomalies",
            "forecasts": "/ml/forecasts",
            "docs": "/docs"
        }
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=settings.ML_SERVICE_HOST,
        port=settings.ML_SERVICE_PORT
    )
```

### Step 10: `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create model directory
RUN mkdir -p /app/models/saved

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
```

---

## 🐳 Docker Integration

### Update `docker-compose.yml`

```yaml
services:
  # ... existing services ...

  ml-service:
    build: ./ml-service
    container_name: ml-service
    ports:
      - "5000:5000"
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=iotistic
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      - MODEL_DIR=/app/models/saved
    volumes:
      - ml-models:/app/models/saved
    networks:
      - zemfyre-net
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  ml-models:  # Persist trained models
```

---

## 🚀 Usage Examples

### 1. Train Isolation Forest (Anomaly Detection)

```bash
# Train model on last 7 days of data
curl -X POST "http://localhost:5000/ml/anomalies/train/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=168"
```

Response:
```json
{
  "message": "Model trained successfully",
  "device_uuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
  "training_samples": 10080,
  "features": ["cpu_usage", "memory_usage_percent", "disk_usage_percent", "network_total"]
}
```

### 2. Detect Anomalies

```bash
# Analyze last 24 hours
curl "http://localhost:5000/ml/anomalies/detect/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=24"
```

Response:
```json
{
  "device_uuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
  "analyzed_points": 1440,
  "anomalies_detected": 12,
  "anomalies": [
    {
      "timestamp": "2025-10-18T14:32:00Z",
      "is_anomaly": true,
      "anomaly_score": -0.342,
      "severity": "warning"
    }
  ]
}
```

### 3. Train LSTM Forecaster

```bash
# Train on CPU usage
curl -X POST "http://localhost:5000/ml/forecasts/train/46b68204-9806-43c5-8d19-18b1f53e3b8a?field=system.cpuUsage&hours=168"
```

### 4. Predict Future Values

```bash
# Predict next 12 data points (12 minutes)
curl "http://localhost:5000/ml/forecasts/predict/46b68204-9806-43c5-8d19-18b1f53e3b8a?field=system.cpuUsage"
```

Response:
```json
{
  "device_uuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
  "field": "system.cpuUsage",
  "predictions": [
    {
      "timestamp": "2025-10-18T15:01:00Z",
      "predicted_value": 45.2,
      "confidence_lower": 40.1,
      "confidence_upper": 50.3
    },
    {
      "timestamp": "2025-10-18T15:02:00Z",
      "predicted_value": 46.8,
      "confidence_lower": 41.7,
      "confidence_upper": 51.9
    }
  ]
}
```

---

## 📊 Integrate ML with Dashboard

### Update React Component with ML Predictions

```typescript
import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';

export function MLPredictiveChart({ deviceUuid, field = 'system.cpuUsage' }) {
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch historical data
      const historyRes = await fetch(
        `http://localhost:4002/api/v1/devices/${deviceUuid}/twin/history?field=${field}&hours=2`
      );
      const historyData = await historyRes.json();

      // Fetch ML predictions
      const forecastRes = await fetch(
        `http://localhost:5000/ml/forecasts/predict/${deviceUuid}?field=${field}`
      );
      const forecastData = await forecastRes.json();

      // Fetch ML anomalies
      const anomalyRes = await fetch(
        `http://localhost:5000/ml/anomalies/detect/${deviceUuid}?hours=2`
      );
      const anomalyData = await anomalyRes.json();

      // Combine data
      const historicalTimestamps = historyData.data.map(p => new Date(p.timestamp));
      const historicalValues = historyData.data.map(p => p.value);
      
      const predictedTimestamps = forecastData.predictions.map(p => new Date(p.timestamp));
      const predictedValues = forecastData.predictions.map(p => p.predicted_value);

      setChartData({
        labels: [...historicalTimestamps, ...predictedTimestamps],
        datasets: [
          {
            label: 'Historical',
            data: [...historicalValues, ...Array(predictedValues.length).fill(null)],
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
          },
          {
            label: 'Predicted (ML)',
            data: [...Array(historicalValues.length).fill(null), ...predictedValues],
            borderColor: 'rgb(34, 197, 94)',
            borderDash: [5, 5],
          },
          {
            label: 'ML Anomalies',
            data: anomalyData.anomalies.map(a => ({
              x: new Date(a.timestamp),
              y: historicalValues[historicalTimestamps.findIndex(t => t.getTime() === new Date(a.timestamp).getTime())]
            })),
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgb(239, 68, 68)',
            pointRadius: 8,
            showLine: false,
            type: 'scatter'
          }
        ]
      });
    };

    fetchData();
  }, [deviceUuid, field]);

  if (!chartData) return <div>Loading ML predictions...</div>;

  return <Line data={chartData} options={{ /* ... */ }} />;
}
```

---

## 🔄 Automated Retraining

### Scheduled Training Job

```python
# services/scheduler.py
import schedule
import time
from services.trainer import train_all_devices

def run_scheduled_training():
    """Retrain models every 24 hours"""
    schedule.every(24).hours.do(train_all_devices)
    
    while True:
        schedule.run_pending()
        time.sleep(60)

# services/trainer.py
def train_all_devices():
    """Train models for all online devices"""
    fetcher = DataFetcher()
    fetcher.connect()
    devices = fetcher.fetch_all_devices_current_state()
    fetcher.close()
    
    for _, device in devices.iterrows():
        device_uuid = device['device_uuid']
        
        try:
            # Train Isolation Forest
            detector = IsolationForestAnomalyDetector()
            # ... train and save ...
            
            # Train LSTM
            forecaster = LSTMForecaster()
            # ... train and save ...
            
            print(f"✅ Trained models for {device_uuid}")
        except Exception as e:
            print(f"❌ Failed to train {device_uuid}: {e}")
```

---

## 📈 Comparison: Z-Score vs ML

| Feature | Z-Score (Statistical) | Isolation Forest (ML) | LSTM (Deep Learning) |
|---------|----------------------|----------------------|---------------------|
| **Setup Complexity** | ⭐ Simple | ⭐⭐ Medium | ⭐⭐⭐ Complex |
| **Training Required** | ❌ No | ✅ Yes | ✅ Yes |
| **Real-Time Speed** | ⚡ Very Fast | ⚡ Fast | 🐌 Slower |
| **Multi-Metric** | ❌ No | ✅ Yes | ✅ Yes |
| **Complex Patterns** | ❌ No | ✅ Yes | ✅ Yes |
| **Predictions** | ❌ No | ❌ No | ✅ Yes |
| **Best For** | Simple, single metric | Complex, multi-metric | Time-series forecasting |

**Recommendation**: Use all three!
- Z-Score: Quick, real-time alerts
- Isolation Forest: Periodic deep analysis
- LSTM: Capacity planning, predictive maintenance

---

## 🎯 Next Steps

1. **Deploy ML Service**:
   ```bash
   cd zemfyre-sensor
   docker-compose up -d ml-service
   ```

2. **Train Initial Models**:
   ```bash
   curl -X POST "http://localhost:5000/ml/anomalies/train/<your-device-uuid>?hours=168"
   curl -X POST "http://localhost:5000/ml/forecasts/train/<your-device-uuid>?field=system.cpuUsage&hours=168"
   ```

3. **Integrate with Dashboard**: Use the React components above

4. **Set Up Automated Retraining**: Run scheduler to retrain daily

5. **Monitor Model Performance**: Track prediction accuracy over time

---

## 📚 Additional Resources

- [Scikit-learn Isolation Forest](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html)
- [TensorFlow LSTM Tutorial](https://www.tensorflow.org/tutorials/structured_data/time_series)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Time-Series Forecasting with Prophet](https://facebook.github.io/prophet/)

**Need help implementing? I can:**
- Create the full ml-service directory structure
- Write integration tests
- Add more ML models (XGBoost, Prophet, Autoencoders)
- Set up model monitoring and drift detection
- Implement A/B testing for model comparison

Let me know what you'd like to build! 🚀
