FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libffi-dev \
    libatlas-base-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install RPi.GPIO paho-mqtt

# Copy your Python script
COPY max31855_reader.py /app/

WORKDIR /app

CMD ["python3", "max31855_reader.py"]
