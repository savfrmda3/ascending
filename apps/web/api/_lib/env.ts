export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function optionalEnv(name: string, fallback = "") {
  return process.env[name] || fallback;
}

