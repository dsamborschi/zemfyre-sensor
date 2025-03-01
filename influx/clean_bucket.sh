#!/bin/bash

# Wait for InfluxDB to start
sleep 10

set -e
# Clean the bucket
influx delete --bucket ZUS80LP \
--start "2013-11-02T00:00:00Z" \
--stop "$(date --utc +%Y-%m-%dT%H:%M:%SZ)" \
--org zemfyre \
--token v2giIFhR9wx244GCxc5wUq8J0vnjkSMvRJgbDLlajm1GpCR8Nc3y_K0ywTHXwHsAFyRPTIX9mEm808_T9ZGq1w==

