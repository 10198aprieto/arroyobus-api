# Realtime API corrections
- [x] Resolve current trips against static routes, stop times and service calendars.
- [x] Reject stale GPS and avoid assigning future trips to current vehicles.
- [x] Keep JSON and protobuf stop updates consistent; eight regression tests pass and all three deployed endpoints respond successfully. Live verification initially showed A42/Azul and R43/Roja; the source subsequently returned stale/future GPS, correctly excluded.