# GTFS update
- [x] Replace Arroyo static ZIP with supplied GTFS_Static.zip (22.2.1) and synchronize all nine TXT/JSON mirrors; exact ZIP, TXT, JSON and API downloads verified, ten static/realtime tests pass. Publish to update production feeds.

# Health history
- [x] Persist observations and distinguish empty vehicle feeds from connection failures, including brief incidents; real observation saved and read back.
- [x] Add date-filtered history, daily summary and CSV/XLSX exports to the status page and /health; mobile downloads and workbook contents verified, thirteen regression tests pass.
- [ ] Automatic minute schedule created, but production callback returns 404 until the user publishes. Authenticated preview callback and rejected anonymous writes verified. Earlier historical data is unavailable without a real source.

# Google Maps realtime diagnosis
- [x] Verify live protobuf feeds: five vehicles and four trip updates returned successfully.
- [x] Correct the invalid feed_start_date in the static ZIP and synchronize its metadata mirrors; nine static/realtime regression tests pass. Publishing and Google re-ingestion remain necessary.
- [ ] Confirm Google Transit ingestion: waiting for the user's latest Google Transit error report and configured static/realtime URLs.

# Realtime API corrections
- [x] Resolve current trips against static routes, stop times and service calendars.
- [x] Reject stale GPS and avoid assigning future trips to current vehicles.
- [x] Keep JSON and protobuf stop updates consistent; eight regression tests pass and all three deployed endpoints respond successfully. Live verification initially showed A42/Azul and R43/Roja; the source subsequently returned stale/future GPS, correctly excluded.

# Laguna de Duero alerts
- [x] Add hidden admin management using the supplied Laguna GTFS lines and stops.
- [x] Extend the existing backend alerts link with an isolated Laguna feed; verified admin publication/readback/deletion, public JSON and protobuf 200, and eleven regression tests. Restored missing role-check execution permission and retired insecure public admin reset endpoint.