#!/usr/bin/python3
import RPi.GPIO as GPIO
import time
import paho.mqtt.client as mqtt

class MAX31855Error(Exception):
    def __init__(self, value):
        self.value = value
    def __str__(self):
        return repr(self.value)

class MAX31855(object):
    def __init__(self, cs_pin, clock_pin, data_pin, units="c", board=GPIO.BCM):
        self.cs_pin = cs_pin
        self.clock_pin = clock_pin
        self.data_pin = data_pin
        self.units = units
        self.data = None
        self.board = board

        GPIO.setmode(self.board)
        GPIO.setup(self.cs_pin, GPIO.OUT)
        GPIO.setup(self.clock_pin, GPIO.OUT)
        GPIO.setup(self.data_pin, GPIO.IN)
        GPIO.output(self.cs_pin, GPIO.HIGH)

    def get(self):
        self.read()
        self.checkErrors()
        return getattr(self, "to_" + self.units)(self.data_to_tc_temperature())

    def get_rj(self):
        self.read()
        return getattr(self, "to_" + self.units)(self.data_to_rj_temperature())

    def read(self):
        bytesin = 0
        GPIO.output(self.cs_pin, GPIO.LOW)
        for i in range(32):
            GPIO.output(self.clock_pin, GPIO.LOW)
            bytesin = bytesin << 1
            if GPIO.input(self.data_pin):
                bytesin |= 1
            GPIO.output(self.clock_pin, GPIO.HIGH)
        GPIO.output(self.cs_pin, GPIO.HIGH)
        self.data = bytesin

    def checkErrors(self, data_32=None):
        if data_32 is None:
            data_32 = self.data
        if (data_32 & 0x10000):
            if (data_32 & 0x01):
                print("MAX31855Error(No Connection)")
            elif (data_32 & 0x02):
                print("Thermocouple reports short to ground")
            elif (data_32 & 0x04):
                raise MAX31855Error("Thermocouple short to VCC")
            else:
                raise MAX31855Error("Unknown Error")

    def data_to_tc_temperature(self, data_32=None):
        if data_32 is None:
            data_32 = self.data
        tc_data = ((data_32 >> 18) & 0x3FFF)
        return self.convert_tc_data(tc_data)

    def data_to_rj_temperature(self, data_32=None):
        if data_32 is None:
            data_32 = self.data
        rj_data = ((data_32 >> 4) & 0xFFF)
        return self.convert_rj_data(rj_data)

    def convert_tc_data(self, tc_data):
        if tc_data & 0x2000:
            tc_data = (~tc_data & 0x1FFF) + 1
            tc_data *= -1
        return tc_data * 0.25

    def convert_rj_data(self, rj_data):
        if rj_data & 0x800:
            rj_data = (~rj_data & 0x7FF) + 1
            rj_data *= -1
        return rj_data * 0.0625

    def to_c(self, celsius):
        return celsius

    def to_k(self, celsius):
        return celsius + 273.15

    def to_f(self, celsius):
        return celsius * 9.0 / 5.0 + 32

    def cleanup(self):
        GPIO.setup(self.cs_pin, GPIO.IN)
        GPIO.setup(self.clock_pin, GPIO.IN)

# ──────────────────────────
# MQTT SETUP
# ──────────────────────────
MQTT_BROKER = "mosquitto"     # or IP address of broker
MQTT_PORT = 1883
MQTT_TOPIC = "sensor/temperature"

mqtt_client = mqtt.Client()
mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)

# ──────────────────────────
# MAIN LOOP
# ──────────────────────────
if __name__ == "__main__":
    cs_pin = 27
    clock_pin = 22
    data_pin = 17
    units = "c"

    thermocouple = MAX31855(cs_pin, clock_pin, data_pin, units)

    try:
        while True:
            rj = thermocouple.get_rj()
            try:
                tc = thermocouple.get()
                payload = f"{tc:.2f}"
                mqtt_client.publish(MQTT_TOPIC, payload)
                print(f"Published: {payload} °{units.upper()} | RJ: {rj:.2f} °{units.upper()}")
            except MAX31855Error as e:
                print(f"Error reading thermocouple: {e}")
            time.sleep(1)
    except KeyboardInterrupt:
        print("Exiting...")
    finally:
        thermocouple.cleanup()
        GPIO.cleanup()
