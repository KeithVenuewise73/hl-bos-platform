// Browser-safe constants shared by the board and the server import route.

/** The tenant a dispatcher's own fleet is imported under in this single-user app. */
export const OWN_FLEET_TENANT = "your-fleet";
export const OWN_FLEET_ID = "own";

export const TRUCK_CSV_TEMPLATE = `id,name,equipment,weight_lbs,volume_cu_yd,home,current_location,available_from,available_until,max_deadhead_mi,service_radius_mi,driver_cost_basis,driver_cost,exclude_commodities,include_commodities,restriction_reason,dedicated_lane_only,dedicated_lane_note
R-1,Reefer 1,reefer,44000,,"Atlanta, GA",32202,2026-09-29T06:00:00-04:00,2026-09-30T20:00:00-04:00,250,350,per-mile,0.62,,,,no,
F-1,Flatbed 1,flatbed,48000,,"Atlanta, GA","Birmingham, AL",2026-09-29T07:00:00-05:00,2026-09-30T18:00:00-05:00,200,300,per-day,320,,,,no,
D-1,Dump 1,dump,46000,36,"Denver, CO","Colorado Springs, CO",2026-09-29T06:00:00-06:00,2026-09-29T20:00:00-06:00,120,150,per-mile,0.6,scrap-metal,,lined body,no,`;

export const LOAD_CSV_TEMPLATE = `id,origin,destination,commodity,commodity_class,weight_lbs,volume_cu_yd,pay_basis,pay,pickup_earliest,pickup_latest,delivery_earliest,delivery_latest,equipment,origin_lat,origin_lon,destination_lat,destination_lon,notes
A-1,"Savannah, GA","Atlanta, GA",Frozen poultry,refrigerated,40000,,flat,1150,2026-09-29T09:00:00-04:00,2026-09-29T15:00:00-04:00,2026-09-29T16:00:00-04:00,2026-09-30T10:00:00-04:00,reefer,,,,,
A-2,35203,"Macon, GA",Rebar bundles,steel,42000,,per-mile,2.6,2026-09-29T08:00:00-05:00,2026-09-29T14:00:00-05:00,2026-09-29T15:00:00-04:00,2026-09-30T12:00:00-04:00,flatbed,,,,,Picks up in Central time
A-3,"Pueblo, CO","Denver, CO",Road base,aggregate,45000,30,flat,700,2026-09-29T08:00:00-06:00,2026-09-29T13:00:00-06:00,2026-09-29T11:00:00-06:00,2026-09-29T18:00:00-06:00,dump,,,,,`;
