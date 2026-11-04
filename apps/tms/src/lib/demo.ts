import "server-only";

/**
 * The local demo: two SYNTHETIC companies, their people and vehicles, held in
 * a MemoryFleetBackend (a port of production fleet.api).
 *
 * Everything here is invented test data, labelled as such on every screen.
 * It is not persisted: restarting the app, or pressing Reset on the Modules
 * page, puts it back exactly as below.
 *
 * Module licences are held here too. In production they would be rows in
 * HL-BOS entitlements.module_activations, written by billing — see README.
 */

import {
  MemoryFleetBackend,
  newInspectionId,
  checklistFor,
  type ModuleKey,
  type Role,
} from "@hl-bos/tms";

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  company: string;
  role: Role;
  title: string;
}

export interface DemoCompany {
  id: string;
  name: string;
  profile: string;
  licensed: ModuleKey[];
}

export const LAKESHORE = "8f1c2a6e-5b7d-4c1e-9a3f-1d2e3f4a5b6c";
export const TWOTRUCKS = "3a9e7c1b-2d4f-4e6a-8b0c-9d1e2f3a4b5c";

const COMPANIES: DemoCompany[] = [
  {
    id: LAKESHORE,
    name: "Lakeshore Fuel Delivery",
    profile:
      "Synthetic regional fuel distributor — the Goetz-style case: tankers, a box truck, a pickup.",
    licensed: ["fleet_management", "driver_management", "dvir", "maintenance"],
  },
  {
    id: TWOTRUCKS,
    name: "Two Trucks Hauling",
    profile: "Synthetic two-truck operator that bought Digital DVIR only.",
    licensed: ["dvir"],
  },
];

export const USERS: DemoUser[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    name: "Olivia Owner",
    email: "olivia@lakeshore.example.test",
    company: LAKESHORE,
    role: "owner",
    title: "Owner",
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    name: "Morgan Ops",
    email: "morgan@lakeshore.example.test",
    company: LAKESHORE,
    role: "manager",
    title: "Operations manager",
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    name: "Max Mechanic",
    email: "max@lakeshore.example.test",
    company: LAKESHORE,
    role: "maintenance",
    title: "Shop lead",
  },
  {
    id: "a0000000-0000-4000-8000-000000000004",
    name: "Dana Driver",
    email: "dana@lakeshore.example.test",
    company: LAKESHORE,
    role: "driver",
    title: "Driver — tankers 101, 102",
  },
  {
    id: "a0000000-0000-4000-8000-000000000005",
    name: "Devon Driver",
    email: "devon@lakeshore.example.test",
    company: LAKESHORE,
    role: "driver",
    title: "Driver — box truck 201",
  },
  {
    id: "b0000000-0000-4000-8000-000000000001",
    name: "Sam Smallfleet",
    email: "sam@twotrucks.example.test",
    company: TWOTRUCKS,
    role: "owner",
    title: "Owner",
  },
  {
    id: "b0000000-0000-4000-8000-000000000002",
    name: "Riley Road",
    email: "riley@twotrucks.example.test",
    company: TWOTRUCKS,
    role: "driver",
    title: "Driver — truck 1",
  },
];

interface DemoState {
  backend: MemoryFleetBackend;
  companies: Map<string, DemoCompany>;
  seededAt: string;
}

const KEY = Symbol.for("hlbos.tms.demo");
type G = typeof globalThis & { [KEY]?: Promise<DemoState> };

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

async function seed(): Promise<DemoState> {
  const b = new MemoryFleetBackend();
  for (const c of COMPANIES) b.addWorkspace(c.id, c.name);
  for (const u of USERS) {
    b.addUser(u.id, u.email);
    b.addMember(u.company, u.id, u.role);
  }
  const morgan = USERS[1]!.id;
  const olivia = USERS[0]!.id;
  const dana = USERS[3]!.id;
  const sam = USERS[5]!.id;

  await b.call(morgan, "save_fleet", {
    workspace: LAKESHORE,
    revision: 0,
    fleet: {
      assets: [
        {
          id: "T-101",
          name: "Tanker 101",
          type: "Tanker",
          tankConfig: "3 compartments, 3,000 gal",
          status: "Available",
          year: 2019,
          make: "Synthetic",
          model: "Tank truck",
          plate: "TEST-101",
          vin: "SYNTHETIC0000T101",
          registrationExpires: daysFromNow(140),
          odometer: 120400,
        },
        {
          id: "T-102",
          name: "Tanker 102",
          type: "Tanker",
          tankConfig: "2 compartments, 2,500 gal",
          status: "Available",
          year: 2017,
          make: "Synthetic",
          model: "Tank truck",
          plate: "TEST-102",
          vin: "SYNTHETIC0000T102",
          registrationExpires: daysFromNow(21),
          odometer: 188030,
        },
        {
          id: "T-104",
          name: "Tanker 104",
          type: "Tanker",
          tankConfig: "1 compartment",
          status: "Inactive",
          year: 2012,
          make: "Synthetic",
          model: "Tank truck",
          plate: "TEST-104",
          vin: "SYNTHETIC0000T104",
          registrationExpires: daysFromNow(-12),
          odometer: 402115,
        },
        {
          id: "B-201",
          name: "Box truck 201",
          type: "Box truck",
          tankConfig: "Not applicable",
          status: "Available",
          year: 2021,
          make: "Synthetic",
          model: "Box 26ft",
          plate: "TEST-201",
          vin: "SYNTHETIC0000B201",
          registrationExpires: daysFromNow(300),
          odometer: 64000,
        },
        {
          id: "P-301",
          name: "Pickup 301",
          type: "Pickup",
          tankConfig: "Not applicable",
          status: "Available",
          year: 2022,
          make: "Synthetic",
          model: "Service pickup",
          plate: "TEST-301",
          vin: "SYNTHETIC0000P301",
          registrationExpires: daysFromNow(200),
          odometer: 31000,
        },
      ],
      work: [
        {
          id: "WO-1001",
          asset: "B-201",
          title: "Liftgate hydraulic seep",
          status: "Open",
          cost: 0,
          opened: daysFromNow(-3),
        },
      ],
      fuel: [],
      drivers: [
        {
          id: "dana",
          name: "Dana Driver",
          email: "dana@lakeshore.example.test",
          licenseClass: "CDL-A",
          endorsements: "H, N, X",
          cdlExpires: daysFromNow(410),
          medicalExpires: daysFromNow(18),
          hired: "2021-04-12",
        },
        {
          id: "devon",
          name: "Devon Driver",
          email: "devon@lakeshore.example.test",
          licenseClass: "CDL-B",
          endorsements: "",
          cdlExpires: daysFromNow(-5),
          medicalExpires: daysFromNow(220),
          hired: "2023-09-01",
        },
      ],
      driverEvents: [],
    },
  });
  await b.call(olivia, "save_member", {
    workspace: LAKESHORE,
    email: "dana@lakeshore.example.test",
    role: "driver",
    active: true,
    units: ["T-101", "T-102"],
  });
  await b.call(olivia, "save_member", {
    workspace: LAKESHORE,
    email: "devon@lakeshore.example.test",
    role: "driver",
    active: true,
    units: ["B-201"],
  });

  // One open, reported defect so the status board and the queue have work on
  // them from the start. Synthetic, like everything else here.
  const t102 = { type: "Tanker", tankConfig: "2 compartments" };
  await b.call(dana, "submit_inspection", {
    workspace: LAKESHORE,
    report: {
      id: newInspectionId(),
      asset: "T-102",
      phase: "End-of-day",
      odometer: 188030,
      inspectedAt: new Date(Date.now() - 20 * 3_600_000).toISOString(),
      driver: "Dana Driver",
      signature: "Dana Driver",
      consent: true,
      checks: checklistFor(t102).map((item) =>
        item === "Hoses / delivery equipment"
          ? {
              item,
              result: "Defect",
              level: 2,
              note: "Delivery hose abraded near reel, weeping at coupling (SYNTHETIC DEMO RECORD)",
            }
          : { item, result: "Pass" },
      ),
    },
  });

  await b.call(sam, "save_fleet", {
    workspace: TWOTRUCKS,
    revision: 0,
    fleet: {
      assets: [
        {
          id: "TT-1",
          name: "Truck 1",
          type: "Box truck",
          tankConfig: "Not applicable",
          status: "Available",
        },
        {
          id: "TT-2",
          name: "Truck 2",
          type: "Flatbed",
          tankConfig: "Not applicable",
          status: "Available",
        },
      ],
      work: [],
      fuel: [],
      drivers: [],
      driverEvents: [],
    },
  });
  await b.call(sam, "save_member", {
    workspace: TWOTRUCKS,
    email: "riley@twotrucks.example.test",
    role: "driver",
    active: true,
    units: ["TT-1"],
  });

  return {
    backend: b,
    companies: new Map(
      COMPANIES.map((c) => [c.id, { ...c, licensed: [...c.licensed] }]),
    ),
    seededAt: new Date().toISOString(),
  };
}

export function demo(): Promise<DemoState> {
  const g = globalThis as G;
  g[KEY] ??= seed();
  return g[KEY];
}

export async function resetDemo(): Promise<void> {
  const g = globalThis as G;
  g[KEY] = seed();
  await g[KEY];
}

export function userById(id: string | undefined): DemoUser | undefined {
  return USERS.find((u) => u.id === id);
}
