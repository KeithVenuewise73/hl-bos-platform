// Minimal types for the two data files DispatchOS Match reads from the
// `zipcodes` package. The package ships no types of its own.

declare module "zipcodes/lib/codes.js" {
  interface ZipRecord {
    zip: string;
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
  }
  const mod: { codes: Record<string, ZipRecord> };
  export default mod;
}

declare module "zipcodes/lib/states.js" {
  const mod: { full: Record<string, string> };
  export default mod;
}
