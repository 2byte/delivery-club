#!/usr/bin/env bun

import { DatabaseFile } from './DatabaseFile';
import { parseArgs } from 'util';

/**
 * Delivery host configuration interface
 */
interface DeliveryHost {
  name: string;
  hostname: string;
  encryptionMethod: string;
  key: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Database structure for delivery hosts
 */
interface DeliveryHostsDB {
  [hostId: string]: DeliveryHost;
}

const DB_PATH = './storage/delivery_hosts.json';
const db = new DatabaseFile<DeliveryHostsDB>(DB_PATH, {});

/**
 * Display help information
 */
function showHelp(): void {
  console.log(`
Delivery Hosts CLI - Manage delivery hosts for content distribution

Usage: bun deliverierCli.ts <command> [options]

Commands:
  list                    List all delivery hosts
  add                     Add a new delivery host
  get <id>                Get details of a specific host
  update <id>             Update an existing host
  delete <id>             Delete a host
  help                    Show this help message

Options for 'add' and 'update':
  --name <name>           Display name for the host
  --hostname <hostname>   Hostname or IP address
  --encryption <method>   Encryption method (e.g., AES-256, RSA, none)
  --key <key>             Encryption key or secret

Examples:
  bun deliverierCli.ts add --name "Production Server" --hostname "prod.example.com" --encryption "AES-256" --key "secret123"
  bun deliverierCli.ts list
  bun deliverierCli.ts get host_1
  bun deliverierCli.ts update host_1 --encryption "RSA" --key "newkey456"
  bun deliverierCli.ts delete host_1
  `);
}

/**
 * Generate a unique host ID
 */
function generateHostId(): string {
  const hosts = db.getAll();
  const existingIds = Object.keys(hosts).filter(key => key.startsWith('host_'));
  const numbers = existingIds.map(id => parseInt(id.replace('host_', '')) || 0);
  const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `host_${nextNumber}`;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

/**
 * Display a single host information
 */
function displayHost(id: string, host: DeliveryHost): void {
  console.log(`\n┌─ Host ID: ${id}`);
  console.log(`├─ Name: ${host.name}`);
  console.log(`├─ Hostname: ${host.hostname}`);
  console.log(`├─ Encryption: ${host.encryptionMethod}`);
  console.log(`├─ Key: ${host.key.substring(0, 10)}${'*'.repeat(Math.max(0, host.key.length - 10))}`);
  console.log(`├─ Created: ${formatDate(host.createdAt)}`);
  console.log(`└─ Updated: ${formatDate(host.updatedAt)}\n`);
}

/**
 * List all delivery hosts
 */
function listHosts(): void {
  const hosts = db.getAll();
  const hostIds = Object.keys(hosts);

  if (hostIds.length === 0) {
    console.log('No delivery hosts found. Use "add" command to create one.');
    return;
  }

  console.log(`\n📦 Delivery Hosts (${hostIds.length} total):`);
  hostIds.forEach(id => {
    const host = hosts[id];
    console.log(`\n  [${id}]`);
    console.log(`    Name: ${host.name}`);
    console.log(`    Hostname: ${host.hostname}`);
    console.log(`    Encryption: ${host.encryptionMethod}`);
  });
  console.log();
}

/**
 * Get details of a specific host
 */
function getHost(hostId: string): void {
  const host = db.get(hostId);
  
  if (!host) {
    console.error(`❌ Host '${hostId}' not found.`);
    process.exit(1);
  }

  displayHost(hostId, host);
}

/**
 * Add a new delivery host
 */
function addHost(options: any): void {
  const { name, hostname, encryption, key } = options;

  // Validate required fields
  if (!name || !hostname || !encryption || !key) {
    console.error('❌ Missing required fields. All of --name, --hostname, --encryption, and --key are required.');
    console.log('Example: bun deliverierCli.ts add --name "Server" --hostname "host.com" --encryption "AES-256" --key "secret"');
    process.exit(1);
  }

  const hostId = generateHostId();
  const now = new Date().toISOString();

  const newHost: DeliveryHost = {
    name,
    hostname,
    encryptionMethod: encryption,
    key,
    createdAt: now,
    updatedAt: now,
  };

  db.set(hostId, newHost);
  console.log(`✅ Successfully added delivery host '${hostId}'`);
  displayHost(hostId, newHost);
}

/**
 * Update an existing delivery host
 */
function updateHost(hostId: string, options: any): void {
  const host = db.get(hostId);

  if (!host) {
    console.error(`❌ Host '${hostId}' not found.`);
    process.exit(1);
  }

  const updates: Partial<DeliveryHost> = {
    updatedAt: new Date().toISOString(),
  };

  if (options.name) updates.name = options.name;
  if (options.hostname) updates.hostname = options.hostname;
  if (options.encryption) updates.encryptionMethod = options.encryption;
  if (options.key) updates.key = options.key;

  const updatedHost = { ...host, ...updates };
  db.set(hostId, updatedHost);

  console.log(`✅ Successfully updated delivery host '${hostId}'`);
  displayHost(hostId, updatedHost);
}

/**
 * Delete a delivery host
 */
function deleteHost(hostId: string): void {
  const host = db.get(hostId);

  if (!host) {
    console.error(`❌ Host '${hostId}' not found.`);
    process.exit(1);
  }

  db.delete(hostId);
  console.log(`✅ Successfully deleted delivery host '${hostId}' (${host.name})`);
}

/**
 * Parse command line arguments
 */
function parseCliArgs(): any {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'help') {
    showHelp();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  // Parse options
  const options: any = {};
  for (let i = 0; i < commandArgs.length; i++) {
    if (commandArgs[i].startsWith('--')) {
      const key = commandArgs[i].substring(2);
      const value = commandArgs[i + 1];
      options[key] = value;
      i++; // Skip next argument as it's the value
    }
  }

  return { command, args: commandArgs, options };
}

/**
 * Main CLI entry point
 */
function main(): void {
  const { command, args, options } = parseCliArgs();

  try {
    switch (command) {
      case 'list':
        listHosts();
        break;

      case 'add':
        addHost(options);
        break;

      case 'get':
        if (args.length < 1 || args[0].startsWith('--')) {
          console.error('❌ Host ID is required. Usage: get <id>');
          process.exit(1);
        }
        getHost(args[0]);
        break;

      case 'update':
        if (args.length < 1 || args[0].startsWith('--')) {
          console.error('❌ Host ID is required. Usage: update <id> [options]');
          process.exit(1);
        }
        updateHost(args[0], options);
        break;

      case 'delete':
        if (args.length < 1 || args[0].startsWith('--')) {
          console.error('❌ Host ID is required. Usage: delete <id>');
          process.exit(1);
        }
        deleteHost(args[0]);
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the CLI
main();
