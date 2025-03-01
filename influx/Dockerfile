FROM influxdb:alpine

# Add a script to create a bucket
COPY ./influx/clean_bucket.sh /docker-entrypoint-initdb.d/

RUN chmod +x /docker-entrypoint-initdb.d/clean_bucket.sh

