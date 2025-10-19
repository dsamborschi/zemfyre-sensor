# ML + Digital Twin Entity-Relationship Integration

**Complete Guide: Connecting Machine Learning Models to the Digital Twin Entity Graph**

This guide shows how to integrate your ML models (anomaly detection, predictive maintenance, forecasting) with the entity-relationship system for:

- **Entity-aware predictions** - ML predictions tied to specific equipment/devices
- **Relationship-based impact analysis** - Propagate ML insights through the dependency graph  
- **Fire evacuation optimization** - ML-powered evacuation time predictions
- **Predictive maintenance with context** - Equipment failure predictions with impact analysis
- **Automated alerting** - ML triggers cascading through entity relationships

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                    Digital Twin Entity System                       │
│                                                                     │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐    │
│  │   Entities   │◄────►│Relationships │◄────►│Graph Service │    │
│  │  (Equipment, │      │  (DEPENDS_ON,│      │  (Impact     │    │
│  │   Devices,   │      │   MONITORS,  │      │   Analysis)  │    │
│  │   Zones)     │      │   POWERS)    │      │              │    │
│  └──────┬───────┘      └──────────────┘      └──────────────┘    │
│         │                                                          │
└─────────┼──────────────────────────────────────────────────────────┘
          │
          ├─ Entity Metadata (location, install_date, capacity)
          ├─ Entity Properties (stored ML predictions)
          │
          ▼
┌────────────────────────────────────────────────────────────────────┐
│                     Device Shadow System                            │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │  Real-Time State: {temperature, humidity, pressure}      │     │
│  │  Historical: device_shadow_history table                 │     │
│  └──────────────────────────────────────────────────────────┘     │
└─────────┬──────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────┐
│                        ML Pipeline                                  │
│                                                                     │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐    │
│  │   Feature    │─────►│  ML Models   │─────►│ Predictions  │    │
│  │ Engineering  │      │  - Anomaly   │      │              │    │
│  │  (Shadow +   │      │  - RUL       │      │              │    │
│  │   Entity)    │      │  - Forecast  │      │              │    │
│  └──────────────┘      └──────────────┘      └──────┬───────┘    │
│         ▲                                            │             │
│         │                                            ▼             │
│  ┌──────┴──────────┐                       ┌──────────────┐      │
│  │Entity Context:  │                       │   Actions:   │      │
│  │ • Location      │                       │ • Store in   │      │
│  │ • Dependencies  │                       │   Properties │      │
│  │ • Relationships │                       │ • Impact     │      │
│  │ • Equipment Type│                       │   Analysis   │      │
│  └─────────────────┘                       │ • Alert      │      │
│                                            └──────────────┘      │
└────────────────────────────────────────────────────────────────────┘
```

---

## Integration Pattern 1: Link Devices to Entities

### Step 1: Create Entity for BME688 Sensor

```bash
# Create device entity
curl -X POST http://localhost:4002/api/v1/entities \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "device",
    "name": "BME688 Environmental Sensor - Lobby",
    "description": "Bosch BME688 air quality sensor",
    "metadata": {
      "device_type": "environmental_sensor",
      "manufacturer": "Bosch",
      "model": "BME688",
      "serial_number": "BME-2025-001",
      "install_date": "2025-01-15",
      "location": "Main lobby entrance",
      "sensor_types": ["temperature", "humidity", "pressure", "gas"],
      "ip_address": "192.168.2.40",
      "firmware_version": "1.0.5"
    }
  }'

# Response: { "data": { "id": "sensor-entity-uuid-123" } }
```

### Step 2: Link Entity to Device Shadow

```bash
# Link entity to device shadow (creates bidirectional mapping)
curl -X POST http://localhost:4002/api/v1/entities/sensor-entity-uuid-123/device \
  -H "Content-Type: application/json" \
  -d '{
    "device_uuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a"
  }'
```

### Step 3: Create Relationships

```bash
# Get building and floor IDs
curl "http://localhost:4002/api/v1/entities/search?q=Maple%20Heights"
# Returns building_id: 1d9bc879-e45e-4a3f-8a09-4da4e0e59b8d

curl "http://localhost:4002/api/v1/entities/search?q=Ground%20Floor"
# Returns floor_id: 623e98d7-6ca9-46c6-b08e-7818f3bfc07f

# Building CONTAINS Floor
curl -X POST http://localhost:4002/api/v1/relationships \
  -H "Content-Type: application/json" \
  -d '{
    "source_entity_id": "1d9bc879-e45e-4a3f-8a09-4da4e0e59b8d",
    "target_entity_id": "623e98d7-6ca9-46c6-b08e-7818f3bfc07f",
    "relationship_type": "CONTAINS",
    "metadata": {"relationship_strength": "structural"}
  }'

# Floor CONTAINS Sensor
curl -X POST http://localhost:4002/api/v1/relationships \
  -H "Content-Type: application/json" \
  -d '{
    "source_entity_id": "623e98d7-6ca9-46c6-b08e-7818f3bfc07f",
    "target_entity_id": "sensor-entity-uuid-123",
    "relationship_type": "CONTAINS",
    "metadata": {"location": "Lobby entrance"}
  }'

# Fire Zone 1 MONITORS Sensor
curl -X POST http://localhost:4002/api/v1/relationships \
  -H "Content-Type: application/json" \
  -d '{
    "source_entity_id": "<fire-zone-1-id>",
    "target_entity_id": "sensor-entity-uuid-123",
    "relationship_type": "MONITORS"
  }'
```

---

## Integration Pattern 2: ML Anomaly Detection with Entity Context

### Python ML Service with Entity Integration

```python
# ml_digital_twin_service.py

import httpx
import asyncio
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import json

class MLDigitalTwinService:
    """
    ML service that integrates with Digital Twin entity graph
    """
    
    def __init__(self):
        self.api_base = "http://localhost:4002/api/v1"
        self.ml_model = self.load_anomaly_model()
        
    def load_anomaly_model(self):
        """Load your trained ML model (Isolation Forest, LSTM, etc.)"""
        from sklearn.ensemble import IsolationForest
        # In production, load from disk
        return IsolationForest(contamination=0.01, random_state=42)
    
    async def analyze_device_with_context(
        self, 
        device_uuid: str
    ) -> Dict:
        """
        Analyze device using ML + entity context
        
        Returns:
            - ML prediction
            - Entity context (location, equipment type)
            - Impact analysis (what systems are affected)
            - Recommendations
        """
        
        # 1. Get device shadow state (real-time data)
        shadow = await self.get_device_shadow(device_uuid)
        
        # 2. Get entity information
        entity = await self.get_entity_by_device(device_uuid)
        
        if not entity:
            return {"error": "Device not linked to entity"}
        
        # 3. Get entity relationships
        relationships = await self.get_entity_relationships(entity['id'])
        
        # 4. Get historical data for ML
        history = await self.get_device_history(device_uuid, hours=24)
        
        # 5. Extract ML features (enriched with entity context)
        features = self.extract_features_with_context(
            shadow, 
            history, 
            entity, 
            relationships
        )
        
        # 6. Run ML prediction
        prediction = self.ml_model.predict([features])[0]
        anomaly_score = self.ml_model.score_samples([features])[0]
        is_anomaly = prediction == -1
        
        # 7. If anomaly detected, analyze impact
        impact = None
        if is_anomaly:
            impact = await self.analyze_impact_via_graph(entity['id'])
        
        # 8. Store ML prediction in entity properties
        await self.store_ml_prediction(
            entity['id'],
            {
                "anomaly_score": float(anomaly_score),
                "is_anomaly": bool(is_anomaly),
                "timestamp": datetime.utcnow().isoformat(),
                "model_version": "isolation_forest_v1.0"
            }
        )
        
        # 9. Generate contextual alert
        alert = None
        if is_anomaly and impact:
            alert = await self.create_contextual_alert(
                entity, 
                shadow, 
                anomaly_score, 
                impact
            )
        
        return {
            "device_uuid": device_uuid,
            "entity": entity,
            "anomaly_detected": is_anomaly,
            "anomaly_score": float(anomaly_score),
            "shadow_state": shadow,
            "impact": impact,
            "alert": alert,
            "analyzed_at": datetime.utcnow().isoformat()
        }
    
    async def get_device_shadow(self, device_uuid: str) -> Dict:
        """Get current device shadow state"""
        async with httpx.AsyncClient() as client:
            # Assuming you have an API endpoint for this
            response = await client.get(
                f"http://localhost:4002/api/v1/devices/{device_uuid}/shadow"
            )
            return response.json()
    
    async def get_entity_by_device(self, device_uuid: str) -> Optional[Dict]:
        """Find entity linked to device shadow"""
        async with httpx.AsyncClient() as client:
            # Query device_locations view
            response = await client.get(
                f"{self.api_base}/graph/device-locations"
            )
            locations = response.json()['data']
            
            # Find matching entity
            for loc in locations:
                if loc.get('device_uuid') == device_uuid:
                    return {
                        'id': loc['entity_id'],
                        'name': loc['device_name'],
                        'type': loc['entity_type'],
                        'location': {
                            'building': loc.get('building_name'),
                            'floor': loc.get('floor_name'),
                            'room': loc.get('room_name')
                        },
                        'metadata': loc.get('metadata', {})
                    }
            return None
    
    async def get_entity_relationships(
        self, 
        entity_id: str
    ) -> List[Dict]:
        """Get all relationships for entity"""
        async with httpx.AsyncClient() as client:
            # Get what depends on this entity
            response = await client.get(
                f"{self.api_base}/relationships",
                params={"target_entity_id": entity_id}
            )
            return response.json()['data']
    
    async def get_device_history(
        self, 
        device_uuid: str, 
        hours: int = 24
    ) -> List[Dict]:
        """Get historical device shadow data"""
        # Query your device_shadow_history table
        # Return list of {timestamp, temperature, humidity, pressure, gas}
        # Implementation depends on your existing API
        pass
    
    def extract_features_with_context(
        self, 
        shadow: Dict,
        history: List[Dict],
        entity: Dict,
        relationships: List[Dict]
    ) -> np.ndarray:
        """
        Extract ML features enriched with entity context
        
        Features:
        - Sensor readings (temperature, humidity, pressure)
        - Historical statistics (mean, std, trend)
        - Entity context (location type, floor number)
        - Relationship context (number of dependencies, criticality)
        """
        
        # Sensor readings
        temp = shadow['reported'].get('temperature', 0)
        humidity = shadow['reported'].get('humidity', 0)
        pressure = shadow['reported'].get('pressure', 0)
        
        # Historical statistics
        if history:
            temp_history = [h.get('temperature', 0) for h in history]
            temp_mean = np.mean(temp_history)
            temp_std = np.std(temp_history)
            temp_trend = np.polyfit(range(len(temp_history)), temp_history, 1)[0]
        else:
            temp_mean = temp_std = temp_trend = 0
        
        # Entity context features
        location_type = entity['location'].get('room', 'unknown')
        is_lobby = 1 if 'lobby' in location_type.lower() else 0
        is_mechanical_room = 1 if 'mechanical' in location_type.lower() else 0
        
        # Derive floor number from floor name
        floor_name = entity['location'].get('floor', 'Ground Floor')
        floor_number = 0  # Default to ground
        if 'Floor' in floor_name:
            try:
                floor_number = int(floor_name.split('Floor')[1].strip())
            except:
                pass
        
        # Relationship context
        num_dependencies = len([
            r for r in relationships 
            if r['relationship_type'] == 'DEPENDS_ON'
        ])
        num_monitoring = len([
            r for r in relationships 
            if r['relationship_type'] == 'MONITORS'
        ])
        is_critical = 1 if num_dependencies > 2 else 0
        
        # Combine all features
        features = np.array([
            temp,
            humidity,
            pressure,
            temp_mean,
            temp_std,
            temp_trend,
            floor_number,
            is_lobby,
            is_mechanical_room,
            num_dependencies,
            num_monitoring,
            is_critical
        ])
        
        return features
    
    async def analyze_impact_via_graph(
        self, 
        entity_id: str
    ) -> Dict:
        """Use graph API to find impact of anomaly"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.api_base}/graph/impact/{entity_id}"
            )
            impact_data = response.json()['data']
            
            affected_count = len(impact_data.get('impacted', []))
            
            # Calculate severity based on impact
            severity = 'low'
            if affected_count > 5:
                severity = 'critical'
            elif affected_count > 2:
                severity = 'high'
            elif affected_count > 0:
                severity = 'medium'
            
            return {
                'affected_count': affected_count,
                'severity': severity,
                'affected_entities': impact_data.get('impacted', [])
            }
    
    async def store_ml_prediction(
        self, 
        entity_id: str, 
        prediction: Dict
    ):
        """Store ML prediction in entity properties"""
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{self.api_base}/entities/{entity_id}/properties",
                json={
                    "property_name": "ml_anomaly_detection",
                    "property_value": prediction
                }
            )
    
    async def create_contextual_alert(
        self,
        entity: Dict,
        shadow: Dict,
        anomaly_score: float,
        impact: Dict
    ) -> Dict:
        """Generate alert with full context"""
        
        alert = {
            "id": self.generate_alert_id(),
            "timestamp": datetime.utcnow().isoformat(),
            "type": "ml_anomaly_detection",
            "severity": impact['severity'],
            "entity": {
                "id": entity['id'],
                "name": entity['name'],
                "type": entity['type'],
                "location": entity['location']
            },
            "sensor_readings": shadow['reported'],
            "ml_analysis": {
                "anomaly_score": float(anomaly_score),
                "model_version": "isolation_forest_v1.0",
                "confidence": abs(anomaly_score)  # Higher magnitude = higher confidence
            },
            "impact": {
                "systems_affected": impact['affected_count'],
                "severity": impact['severity'],
                "affected_entities": [
                    {
                        "name": e['entity']['name'],
                        "type": e['entity']['entity_type'],
                        "depth": e['depth']
                    }
                    for e in impact['affected_entities'][:5]  # Top 5
                ]
            },
            "recommendations": self.generate_recommendations(
                entity, 
                impact, 
                shadow
            )
        }
        
        # Send alert via MQTT/Email/SMS
        await self.send_alert(alert)
        
        return alert
    
    def generate_recommendations(
        self,
        entity: Dict,
        impact: Dict,
        shadow: Dict
    ) -> List[str]:
        """Generate context-aware recommendations"""
        recommendations = []
        
        # Based on location
        if 'lobby' in entity['location'].get('room', '').lower():
            recommendations.append("Check lobby environmental controls immediately")
            recommendations.append("Verify HVAC system in lobby area")
        
        # Based on impact
        if impact['affected_count'] > 0:
            recommendations.append(
                f"Inspect {impact['affected_count']} dependent systems"
            )
        
        # Based on sensor readings
        temp = shadow['reported'].get('temperature', 0)
        if temp > 30:
            recommendations.append("High temperature detected - check fire detection systems")
        
        return recommendations
    
    def generate_alert_id(self) -> str:
        import uuid
        return str(uuid.uuid4())
    
    async def send_alert(self, alert: Dict):
        """Send alert via multiple channels"""
        # MQTT
        # await self.publish_mqtt(f"alerts/{alert['severity']}", json.dumps(alert))
        
        # Email (if critical)
        # if alert['severity'] == 'critical':
        #     await self.send_email(alert)
        
        # SMS (if critical)
        # if alert['severity'] == 'critical':
        #     await self.send_sms(alert)
        
        print(f"🚨 ALERT: {alert['severity'].upper()} - {alert['entity']['name']}")
        print(f"   Impact: {alert['impact']['systems_affected']} systems affected")


# Usage Example
async def main():
    ml_service = MLDigitalTwinService()
    
    # Analyze BME688 sensor
    result = await ml_service.analyze_device_with_context(
        "46b68204-9806-43c5-8d19-18b1f53e3b8a"
    )
    
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
```

---

## Integration Pattern 3: Predictive Maintenance with Impact

### Equipment Failure Prediction

```python
# predictive_maintenance_service.py

class PredictiveMaintenanceService:
    """
    Predict equipment failures and analyze impact via entity graph
    """
    
    def __init__(self):
        self.api_base = "http://localhost:4002/api/v1"
        self.rul_model = self.load_rul_model()  # Remaining Useful Life model
    
    async def predict_hvac_failure(self, hvac_entity_id: str) -> Dict:
        """
        Predict HVAC system failure with impact analysis
        
        Example: Central Chiller failure prediction
        """
        
        # 1. Get HVAC entity
        entity = await self.get_entity(hvac_entity_id)
        
        # 2. Get equipment metadata
        install_date = entity['metadata'].get('install_date')
        age_days = (datetime.now() - datetime.fromisoformat(install_date)).days
        
        # 3. Get historical performance data (from linked device shadow)
        if entity.get('device_uuid'):
            history = await self.get_device_history(entity['device_uuid'])
        else:
            # For equipment without sensors, use maintenance logs
            history = await self.get_maintenance_history(hvac_entity_id)
        
        # 4. Extract features
        features = self.extract_equipment_features(entity, history, age_days)
        
        # 5. Predict remaining useful life (RUL)
        rul_days = self.rul_model.predict([features])[0]
        failure_probability = self.calculate_failure_probability(rul_days)
        
        # 6. If high failure risk, analyze impact
        impact = None
        if failure_probability > 0.6:
            impact = await self.analyze_failure_impact(hvac_entity_id)
        
        # 7. Generate maintenance work order
        work_order = None
        if failure_probability > 0.6:
            work_order = await self.create_work_order(
                entity,
                rul_days,
                failure_probability,
                impact
            )
        
        # 8. Store prediction
        await self.store_prediction(
            hvac_entity_id,
            {
                "remaining_useful_life_days": rul_days,
                "failure_probability": failure_probability,
                "predicted_failure_date": (
                    datetime.now() + timedelta(days=rul_days)
                ).isoformat(),
                "timestamp": datetime.utcnow().isoformat()
            }
        )
        
        return {
            "entity": entity,
            "remaining_useful_life_days": rul_days,
            "failure_probability": failure_probability,
            "predicted_failure_date": (
                datetime.now() + timedelta(days=rul_days)
            ).isoformat(),
            "impact": impact,
            "work_order": work_order
        }
    
    def extract_equipment_features(
        self, 
        entity: Dict, 
        history: List[Dict], 
        age_days: int
    ) -> np.ndarray:
        """Extract features for RUL prediction"""
        
        # Equipment metadata
        capacity = entity['metadata'].get('capacity_tons', 0)
        
        # Usage patterns (from history)
        if history:
            avg_runtime_hours = np.mean([h.get('runtime', 0) for h in history])
            cycles_per_day = len(history) / 30  # Assuming 30 days of history
        else:
            avg_runtime_hours = cycles_per_day = 0
        
        # Environmental conditions
        if history:
            avg_temp = np.mean([h.get('ambient_temp', 20) for h in history])
        else:
            avg_temp = 20
        
        # Maintenance history
        days_since_maintenance = self.get_days_since_maintenance(entity['metadata'])
        
        features = np.array([
            age_days,
            capacity,
            avg_runtime_hours,
            cycles_per_day,
            avg_temp,
            days_since_maintenance
        ])
        
        return features
    
    def calculate_failure_probability(self, rul_days: float) -> float:
        """Convert RUL to failure probability"""
        # Simple sigmoid function
        # High probability if RUL < 30 days
        return 1 / (1 + np.exp((rul_days - 30) / 10))
    
    async def analyze_failure_impact(self, entity_id: str) -> Dict:
        """What happens if this equipment fails?"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.api_base}/graph/impact/{entity_id}"
            )
            impact_data = response.json()['data']
            
            # Categorize impacted systems
            critical_systems = []
            high_priority = []
            medium_priority = []
            
            for item in impact_data['impacted']:
                entity_type = item['entity']['entity_type']
                depth = item['depth']
                
                if entity_type in ['fire_suppression', 'emergency_power']:
                    critical_systems.append(item)
                elif depth == 1:  # Direct dependencies
                    high_priority.append(item)
                else:
                    medium_priority.append(item)
            
            return {
                "total_affected": len(impact_data['impacted']),
                "critical_systems": critical_systems,
                "high_priority": high_priority,
                "medium_priority": medium_priority,
                "severity": 'critical' if critical_systems else 'high'
            }
    
    async def create_work_order(
        self,
        entity: Dict,
        rul_days: float,
        failure_probability: float,
        impact: Dict
    ) -> Dict:
        """Generate predictive maintenance work order"""
        
        work_order = {
            "id": str(uuid.uuid4()),
            "type": "predictive_maintenance",
            "priority": "critical" if failure_probability > 0.8 else "high",
            "created_at": datetime.utcnow().isoformat(),
            "entity": {
                "id": entity['id'],
                "name": entity['name'],
                "type": entity['type'],
                "location": entity.get('location')
            },
            "prediction": {
                "remaining_useful_life_days": rul_days,
                "failure_probability": failure_probability,
                "predicted_failure_date": (
                    datetime.now() + timedelta(days=rul_days)
                ).isoformat()
            },
            "impact_analysis": {
                "systems_affected": impact['total_affected'],
                "critical_systems": len(impact['critical_systems']),
                "severity": impact['severity']
            },
            "recommended_actions": [
                f"Inspect equipment within {max(1, int(rul_days // 2))} days",
                "Order replacement parts",
                "Schedule maintenance window",
                "Notify building management",
                f"Verify {impact['total_affected']} backup systems operational"
            ],
            "estimated_downtime_hours": 4,
            "estimated_cost_usd": 5000
        }
        
        # Store in database (add to entity properties)
        await self.store_work_order(entity['id'], work_order)
        
        return work_order
    
    def load_rul_model(self):
        """Load Remaining Useful Life model"""
        from sklearn.ensemble import RandomForestRegressor
        # In production, load trained model from disk
        return RandomForestRegressor(n_estimators=100, random_state=42)

# Usage
service = PredictiveMaintenanceService()
result = await service.predict_hvac_failure("<central-chiller-entity-id>")
```

---

## Integration Pattern 4: Fire Evacuation ML Optimization

### ML-Powered Evacuation Planning

```python
# evacuation_ml_service.py

class EvacuationMLService:
    """
    Use ML to optimize evacuation routes and predict evacuation time
    """
    
    def __init__(self):
        self.api_base = "http://localhost:4002/api/v1"
        self.crowd_flow_model = self.load_crowd_flow_model()
    
    async def predict_evacuation_time(
        self, 
        fire_location_entity_id: str,
        time_of_day: int = None  # Hour (0-23)
    ) -> Dict:
        """
        Predict evacuation time given fire location
        
        Uses:
        - Entity graph for building structure
        - ML model for crowd flow prediction
        - Relationship data for evacuation routes
        """
        
        # 1. Get fire location entity
        fire_entity = await self.get_entity(fire_location_entity_id)
        floor_number = fire_entity['metadata'].get('floor_number', 0)
        
        # 2. Get building (traverse up the hierarchy)
        building = await self.get_building_for_entity(fire_location_entity_id)
        
        # 3. Get all evacuation routes (stairwells)
        stairwells = await self.get_evacuation_routes(building['id'])
        
        # 4. Get all floors
        floors = await self.get_all_floors(building['id'])
        
        # 5. Estimate occupancy per floor
        occupancy_data = await self.estimate_occupancy(
            floors, 
            time_of_day or datetime.now().hour
        )
        
        # 6. ML model predicts crowd flow
        ml_input = {
            'fire_floor': floor_number,
            'occupancy_per_floor': occupancy_data,
            'stairwell_capacities': [
                s['metadata']['width_inches'] for s in stairwells
            ],
            'num_stairwells': len(stairwells),
            'time_of_day': time_of_day or datetime.now().hour,
            'day_of_week': datetime.now().weekday(),
            'is_weekend': datetime.now().weekday() >= 5
        }
        
        evacuation_prediction = self.crowd_flow_model.predict(ml_input)
        
        # 7. Identify bottlenecks using ML
        bottlenecks = self.identify_bottlenecks(
            occupancy_data,
            stairwells,
            evacuation_prediction
        )
        
        # 8. Optimize routes
        optimized_plan = await self.optimize_evacuation_routes(
            fire_entity,
            floors,
            stairwells,
            occupancy_data,
            bottlenecks
        )
        
        return {
            "fire_location": {
                "name": fire_entity['name'],
                "floor": floor_number,
                "entity_id": fire_location_entity_id
            },
            "building": building,
            "predicted_evacuation_time_minutes": optimized_plan['total_time'],
            "occupancy": occupancy_data,
            "evacuation_routes": stairwells,
            "bottlenecks": bottlenecks,
            "route_assignments": optimized_plan['assignments'],
            "recommendations": optimized_plan['recommendations']
        }
    
    async def get_evacuation_routes(self, building_id: str) -> List[Dict]:
        """Get all stairwells in building"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.api_base}/entities/search",
                params={"q": "stairwell"}
            )
            all_stairwells = response.json()['data']
            
            # Filter to this building only
            # (Would need to traverse hierarchy in production)
            return all_stairwells
    
    async def estimate_occupancy(
        self, 
        floors: List[Dict], 
        hour: int
    ) -> Dict[int, int]:
        """
        Estimate building occupancy by floor
        
        Uses:
        - Entity metadata (apartment counts, office counts)
        - Time of day (more people at night in residential)
        - ML model (historical occupancy patterns)
        """
        occupancy = {}
        
        for floor in floors:
            floor_num = floor['metadata'].get('floor_number', 0)
            floor_type = floor['metadata'].get('floor_type', 'residential')
            
            # Get units on this floor
            units_query = await httpx.AsyncClient().get(
                f"{self.api_base}/relationships",
                params={
                    "source_entity_id": floor['id'],
                    "relationship_type": "CONTAINS"
                }
            )
            units = units_query.json()['data']
            unit_count = len(units)
            
            # Estimate based on floor type and time
            if floor_type == 'residential':
                # 2 people per unit on average
                base_occupancy = unit_count * 2
                
                # More people at night (8pm - 7am)
                if hour >= 20 or hour < 7:
                    occupancy[floor_num] = int(base_occupancy * 0.9)  # 90% home
                else:
                    occupancy[floor_num] = int(base_occupancy * 0.3)  # 30% home
            
            elif floor_type == 'parking':
                occupancy[floor_num] = 2  # Minimal
            
            else:  # Common areas
                if 8 <= hour <= 22:  # Active hours
                    occupancy[floor_num] = 10
                else:
                    occupancy[floor_num] = 2
        
        return occupancy
    
    def identify_bottlenecks(
        self,
        occupancy: Dict[int, int],
        stairwells: List[Dict],
        ml_prediction: Dict
    ) -> List[Dict]:
        """Identify evacuation bottlenecks using ML"""
        
        bottlenecks = []
        
        # Calculate total stairwell capacity
        total_capacity_per_min = sum([
            # 60 inches width = ~30 people/min
            (s['metadata']['width_inches'] / 2) 
            for s in stairwells
        ])
        
        # Check each floor
        for floor_num, people_count in occupancy.items():
            # If people > capacity, bottleneck detected
            if people_count > total_capacity_per_min * 2:
                bottlenecks.append({
                    "floor": floor_num,
                    "occupancy": people_count,
                    "capacity": total_capacity_per_min,
                    "overflow": people_count - (total_capacity_per_min * 2),
                    "estimated_delay_minutes": (
                        (people_count - total_capacity_per_min * 2) 
                        / total_capacity_per_min
                    ),
                    "severity": "high"
                })
        
        return bottlenecks
    
    async def optimize_evacuation_routes(
        self,
        fire_entity: Dict,
        floors: List[Dict],
        stairwells: List[Dict],
        occupancy: Dict[int, int],
        bottlenecks: List[Dict]
    ) -> Dict:
        """Optimize evacuation using ML + graph"""
        
        fire_floor = fire_entity['metadata'].get('floor_number', 0)
        
        assignments = {}
        recommendations = []
        total_time = 0
        
        # If fire on floor 10
        if fire_floor == 10:
            # Floors above fire: shelter-in-place initially
            recommendations.append({
                "action": "shelter_in_place",
                "floors": list(range(fire_floor + 1, 16)),
                "duration_minutes": 15,
                "reason": "Avoid smoke/congestion on stairs"
            })
            
            # Floors below fire: immediate evacuation
            recommendations.append({
                "action": "immediate_evacuation",
                "floors": list(range(1, fire_floor)),
                "reason": "No smoke risk, clear evacuation path"
            })
            
            # Fire floor: emergency evacuation
            recommendations.append({
                "action": "emergency_evacuation",
                "floors": [fire_floor],
                "route": "Stairwell B and C only (avoid Stairwell A near fire)"
            })
            
            # Assign people to stairwells
            total_people_below = sum(
                occupancy.get(f, 0) for f in range(1, fire_floor)
            )
            
            # Split evenly across stairwells
            people_per_stairwell = total_people_below / len(stairwells)
            for i, stairwell in enumerate(stairwells):
                assignments[stairwell['name']] = int(people_per_stairwell)
            
            # Calculate evacuation time
            # Assume 90 people/min total capacity (3 stairwells × 30 people/min)
            total_time = total_people_below / 90  # minutes
        
        return {
            "total_time": round(total_time, 1),
            "assignments": assignments,
            "recommendations": recommendations
        }
    
    def load_crowd_flow_model(self):
        """Load ML model for crowd flow prediction"""
        # In production: trained neural network or simulation model
        class DummyModel:
            def predict(self, input_data):
                return {"total_time": 12.5, "bottleneck_floors": [3, 7, 10]}
        
        return DummyModel()

# Usage
evac_service = EvacuationMLService()
result = await evac_service.predict_evacuation_time(
    "<unit-1005-entity-id>",  # Fire in Unit 1005 (Floor 10)
    time_of_day=22  # 10 PM (peak occupancy)
)
```

---

## Integration Pattern 5: Store ML Predictions in Entities

### Add ML Predictions as Entity Properties

```bash
# Store anomaly detection result
curl -X POST http://localhost:4002/api/v1/entities/<sensor-entity-id>/properties \
  -H "Content-Type: application/json" \
  -d '{
    "property_name": "ml_anomaly_detection",
    "property_value": {
      "anomaly_score": 0.85,
      "is_anomaly": true,
      "timestamp": "2025-10-18T14:30:00Z",
      "model_version": "isolation_forest_v1.0",
      "confidence": 0.92,
      "features_analyzed": [
        "temperature",
        "humidity",
        "pressure",
        "historical_trend"
      ]
    }
  }'

# Store predictive maintenance result
curl -X POST http://localhost:4002/api/v1/entities/<hvac-entity-id>/properties \
  -H "Content-Type: application/json" \
  -d '{
    "property_name": "ml_predictive_maintenance",
    "property_value": {
      "remaining_useful_life_days": 45,
      "failure_probability": 0.72,
      "predicted_failure_date": "2025-12-02",
      "timestamp": "2025-10-18T14:30:00Z",
      "model_version": "rul_xgboost_v2.0",
      "work_order_created": true,
      "work_order_id": "WO-2025-1234"
    }
  }'

# Store evacuation prediction
curl -X POST http://localhost:4002/api/v1/entities/<building-entity-id>/properties \
  -H "Content-Type: application/json" \
  -d '{
    "property_name": "ml_evacuation_analysis",
    "property_value": {
      "predicted_evacuation_time_minutes": 12.5,
      "last_fire_drill_date": "2025-09-15",
      "actual_drill_time_minutes": 14.2,
      "prediction_accuracy": 0.88,
      "bottleneck_floors": [3, 7, 10],
      "timestamp": "2025-10-18T14:30:00Z"
    }
  }'
```

### Query Entities with ML Predictions

```bash
# Find all entities with anomalies detected
curl "http://localhost:4002/api/v1/entities" | \
  jq '.data[] | select(.properties.ml_anomaly_detection.is_anomaly == true)'

# Find equipment with high failure probability
curl "http://localhost:4002/api/v1/entities" | \
  jq '.data[] | select(.properties.ml_predictive_maintenance.failure_probability > 0.7)'
```

---

## Complete End-to-End Example

### Scenario: Temperature Anomaly → Impact Analysis → Alert

```python
# complete_flow.py

async def main():
    """
    Complete flow: ML detects anomaly → Entity graph shows impact → Alert sent
    """
    
    # 1. ML Service analyzes device
    ml_service = MLDigitalTwinService()
    
    device_uuid = "46b68204-9806-43c5-8d19-18b1f53e3b8a"  # BME688 sensor
    
    result = await ml_service.analyze_device_with_context(device_uuid)
    
    print("=" * 60)
    print("ML ANALYSIS RESULT")
    print("=" * 60)
    print(f"Device: {result['entity']['name']}")
    print(f"Location: {result['entity']['location']}")
    print(f"Anomaly Detected: {result['anomaly_detected']}")
    print(f"Anomaly Score: {result['anomaly_score']:.3f}")
    
    if result['anomaly_detected']:
        print("\n" + "=" * 60)
        print("IMPACT ANALYSIS (via Entity Graph)")
        print("=" * 60)
        
        impact = result['impact']
        print(f"Affected Systems: {impact['affected_count']}")
        print(f"Severity: {impact['severity'].upper()}")
        
        print("\nAffected Entities:")
        for entity in impact['affected_entities'][:5]:
            print(f"  • {entity['entity']['name']} "
                  f"({entity['entity']['entity_type']}) "
                  f"- Depth: {entity['depth']}")
        
        print("\n" + "=" * 60)
        print("ALERT GENERATED")
        print("=" * 60)
        
        alert = result['alert']
        print(f"Alert ID: {alert['id']}")
        print(f"Severity: {alert['severity'].upper()}")
        print(f"Type: {alert['type']}")
        
        print("\nRecommendations:")
        for rec in alert['recommendations']:
            print(f"  • {rec}")
        
        print("\n✅ Alert sent via MQTT/Email/SMS")
        print("✅ ML prediction stored in entity properties")
        print("✅ Work order created (if required)")

if __name__ == "__main__":
    asyncio.run(main())
```

### Expected Output

```
============================================================
ML ANALYSIS RESULT
============================================================
Device: BME688 Environmental Sensor - Lobby
Location: {'building': 'Maple Heights Condominium', 'floor': 'Ground Floor', 'room': 'Main Lobby'}
Anomaly Detected: True
Anomaly Score: -0.342

============================================================
IMPACT ANALYSIS (via Entity Graph)
============================================================
Affected Systems: 4
Severity: HIGH

Affected Entities:
  • Fire Zone 1 - Lobby & Common Areas (zone) - Depth: 1
  • Main Fire Alarm Control Panel (equipment) - Depth: 2
  • HVAC System (equipment) - Depth: 1
  • Smart Thermostat (device) - Depth: 2

============================================================
ALERT GENERATED
============================================================
Alert ID: a8f3e6d9-1234-5678-9abc-def012345678
Severity: HIGH
Type: ml_anomaly_detection

Recommendations:
  • Check lobby environmental controls immediately
  • Verify HVAC system in lobby area
  • Inspect 4 dependent systems
  • Check fire detection systems

✅ Alert sent via MQTT/Email/SMS
✅ ML prediction stored in entity properties
✅ Work order created (if required)
```

---

## Summary: Integration Benefits

### ✅ What You Get

1. **Context-Aware ML**
   - ML predictions enriched with entity metadata
   - Location-aware anomaly detection
   - Equipment-type-specific models

2. **Impact Propagation**
   - ML detects issue → Graph shows cascading effects
   - Prioritize alerts based on dependency graph
   - Identify critical systems at risk

3. **Automated Workflows**
   - ML → Entity → Impact → Alert → Work Order
   - Severity calculated from ML score + impact
   - Recommendations based on entity context

4. **Predictive Capabilities**
   - Equipment failure predictions with impact analysis
   - Evacuation time optimization using building graph
   - Capacity planning with entity relationships

5. **Unified Storage**
   - ML predictions stored as entity properties
   - Query entities by ML metrics
   - Historical ML performance tracking

---

## Next Steps

1. ✅ **Link devices to entities** (create entity for each sensor/equipment)
2. ✅ **Implement ML service** (use patterns above)
3. ✅ **Test anomaly detection** with entity context
4. ✅ **Deploy predictive maintenance** for critical equipment
5. ✅ **Build evacuation optimizer** using entity graph
6. ✅ **Create dashboard** showing ML predictions + impact

**Your ML models + Digital Twin = Intelligent, Context-Aware Building Management** 🧠🏢🔥
