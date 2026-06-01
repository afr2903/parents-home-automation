# Development Guide: Flashing ESP32 Firmware

This guide covers building and uploading the `tank/` and `pump/` Arduino sketches with [Arduino CLI](https://arduino.github.io/arduino-cli/). **The commands below were written and tested on macOS.** Once Arduino CLI is installed, the compile/upload workflow is largely the same on Windows.

---

## Clone the repo

```bash
git clone https://github.com/afr2903/parents-home-automation.git
cd parents-home-automation/water-flow
```

All following commands assume you are in the `water-flow/` directory.

---

## Install Arduino CLI

### macOS

Install via Homebrew:

```bash
brew update
brew install arduino-cli
```

See also: [Arduino CLI installation docs](https://arduino.github.io/arduino-cli/latest/installation/)

### Windows

Installation differs from macOS. Use one of the options in the official docs:

- [Arduino CLI installation (Windows)](https://arduino.github.io/arduino-cli/latest/installation/#windows)
- [Download releases](https://github.com/arduino/arduino-cli/releases) (`.exe` installer or standalone binary)

After installing, open a new terminal and confirm it works:

```bash
arduino-cli version
```

---

## One-time setup (cores and libraries)

Run these once after Arduino CLI is installed. They are the same on macOS and Windows.

From the `water-flow/` project root:

```bash
arduino-cli config add board_manager.additional_urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32:esp32
arduino-cli lib install "ArduinoJson"
```

---

## Configure secrets

Before compiling, fill in the WiFi and API key for the sketch you are flashing. These files are gitignored — never commit them.

**`tank/secrets.h`** (tank sensor ESP32):

```cpp
#define WIFI_SSID     "YourNetwork"
#define WIFI_PASSWORD "YourPassword"
#define API_KEY       "your-tank-api-key"
```

**`pump/secrets.h`** (pump relay ESP32):

```cpp
#define WIFI_SSID     "YourNetwork"
#define WIFI_PASSWORD "YourPassword"
#define API_KEY       "your-pump-api-key"
```

---

## Compile

From the `water-flow/` project root, replace `tank` with `pump` when flashing the pump firmware:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 tank
```

---

## Upload

### 1. Find the serial port

With the ESP32 **unplugged**, list boards:

```bash
arduino-cli board list
```

Plug in the ESP32, then run again:

```bash
arduino-cli board list
```

Copy the port that appeared:

| Platform | Example port |
|----------|--------------|
| macOS    | `/dev/cu.usbserial-10` |
| Windows  | `COM3` |


### 2. Upload the sketch

Replace the port and sketch name (`tank` or `pump`) as needed:

**macOS:**

```bash
arduino-cli upload -p /dev/cu.usbserial-10 --fqbn esp32:esp32:esp32:UploadSpeed=115200 tank
```

**Windows:**

```bash
arduino-cli upload -p COM3 --fqbn esp32:esp32:esp32:UploadSpeed=115200 tank
```

---

## Quick reference

| Task | Command |
|------|---------|
| Compile tank firmware | `arduino-cli compile --fqbn esp32:esp32:esp32 tank` |
| Compile pump firmware | `arduino-cli compile --fqbn esp32:esp32:esp32 pump` |
| List serial ports | `arduino-cli board list` |
| Upload (macOS) | `arduino-cli upload -p /dev/cu.usbserial-XX --fqbn esp32:esp32:esp32:UploadSpeed=115200 <sketch>` |
| Upload (Windows) | `arduino-cli upload -p COMX --fqbn esp32:esp32:esp32:UploadSpeed=115200 <sketch>` |

For server/dashboard local development, see [README.md](./README.md). For Fly.io deployment, see [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md).
