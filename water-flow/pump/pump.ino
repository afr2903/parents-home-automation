const int pumpPin = 13;

void setup() {
    pinMode(pumpPin, OUTPUT);
}

void loop() {
    digitalWrite(pumpPin, HIGH);
    delay(5000);
    digitalWrite(pumpPin, LOW);
    delay(10000);
}
