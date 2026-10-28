# Fleet bridge

The part of the platform that runs on the robots' network. The core (the web app) runs in the cloud and can't hold
an MQTT connection; this small service does, and carries messages both ways:

- **core → machines**: collects the commands waiting for it — VDA 5050 orders and instant actions, DJI Cloud API flight
  tasks — publishes them on your MQTT broker, and tells the core whether each one went (for DJI, when the dock replies).
- **machines → core**: VDA 5050 `state` and `connection`, DJI `osd` (telemetry) and `flighttask_progress`, posted to the
  core, which reads them into robot status, battery, position and mission progress. Unchanged state is sent at most
  every 30 s per robot.
- It answers what DJI docks expect from their cloud (`status_reply`, `events_reply`).

Spot (Orbit) and security robots don't need the bridge: the core calls Orbit's REST API itself, and both post their
webhooks/alarms to the core directly.

## Run

Node 18 or later, on a machine that can reach both the broker and the core (HTTPS out):

```
cd bridge
npm install
CORE_URL=https://rop.bohiotech.com \
FLEET_BRIDGE_TOKEN=… \
MQTT_URL=mqtts://broker.site.local:8883 MQTT_USERNAME=… MQTT_PASSWORD=… \
VDA_ROBOTS='{"AirsideRobotics/FOD-001":"FOD-1"}' \
DJI_DOCKS='{"DOCK-KGIA-01":"Drone-A1"}' \
node fleet-bridge.mjs
```

Run it as a service (systemd, a container, or the site's edge box) so it restarts with the machine.

| Setting | What it is |
|---|---|
| `CORE_URL` | The app's address. |
| `FLEET_BRIDGE_TOKEN` | The same value as `FLEET_BRIDGE_TOKEN` on the app (16+ characters). |
| `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_CLIENT_ID` | Your broker (the one the robots and docks use). |
| `VDA_INTERFACE` | VDA 5050 topic prefix, default `uagv`. |
| `VDA_ROBOTS` | `{"manufacturer/serialNumber": "robot name in the app"}` for each VDA 5050 robot. |
| `DJI_DOCKS` | `{"dock serial number": "robot name in the app"}` for each DJI Dock. |
| `POLL_MS` | How often it collects commands (default 3000). |
| `REPORT_EVERY_MS` | How often an unchanged state is sent again (default 30000). |

On the app, also set `VDA5050_NODES` (our places → the robot map's node ids) and `DJI_WAYLINES` (our places → the
wayline KMZ files planned in DJI's tools). See SETUP §8f.

## Status

Tested against a local MQTT broker with a simulated VDA 5050 robot and a simulated DJI dock: orders and flight tasks go
out, acknowledgements and state come back, missions end as done. It has not yet been run against a real robot or dock —
do that on site before relying on it. The message shapes follow the VDA 5050 2.0 specification and DJI's Cloud API
documentation.
