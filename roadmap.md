# Realtime API corrections
- [x] Resolve current trips against static routes, stop times and service calendars.
- [x] Reject stale GPS and avoid assigning future trips to current vehicles.
- [x] Keep JSON and protobuf stop updates consistent; eight regression tests pass and all three deployed endpoints respond successfully. Live verification initially showed A42/Azul and R43/Roja; the source subsequently returned stale/future GPS, correctly excluded.

# Laguna de Duero alerts
- [x] Add hidden admin management using the supplied Laguna GTFS lines and stops.
- [x] Extend the existing backend alerts link with an isolated Laguna feed; verified admin publication/readback/deletion, public JSON and protobuf 200, and eleven regression tests. Restored missing role-check execution permission and retired insecure public admin reset endpoint.