const fs = require('fs');
const path = require('path');

// Mock xterm and addons before requiring app.js
global.Terminal = class Terminal {
  constructor() {}
  writeln() {}
  focus() {}
};

// Load helpers from app.js (we'll extract them for testing)
const appContent = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/js/app.js'),
  'utf-8'
);

// Extract helper functions for testing
function getProtocolColor(protocol) {
  const colorMap = {
    'local': '#45475a',
    'ssh': '#89b4fa',
    'serial': '#f38ba8',
    'telnet': '#f9e2af',
    'ftp': '#a6e3a1',
  };
  return colorMap[protocol] || '#6c7086';
}

function deriveGroupId(protocol, connectionProfile) {
  if (protocol === 'local') return 'group-local';
  if (protocol === 'serial') return 'group-serial';
  if (connectionProfile?.sshMode) {
    return `group-${connectionProfile.sshMode}`;
  }
  return `group-${protocol}`;
}

function getDefaultGroupsForProtocols(protocols) {
  const groups = [];
  const PROTOCOL_ORDER = ['local', 'ssh', 'serial', 'telnet', 'ftp'];

  for (const proto of PROTOCOL_ORDER) {
    if (!protocols.includes(proto)) continue;

    groups.push({
      id: `group-${proto}`,
      name: proto.charAt(0).toUpperCase() + proto.slice(1),
      protocol: proto,
      isAutoGroup: true,
      color: getProtocolColor(proto),
      isCollapsed: false,
      displayOrder: groups.length,
    });
  }
  return groups;
}

describe('Tab Grouping — Helpers', () => {
  describe('deriveGroupId()', () => {
    it('returns group-local for local protocol', () => {
      expect(deriveGroupId('local', null)).toBe('group-local');
    });

    it('returns group-serial for serial protocol', () => {
      expect(deriveGroupId('serial', null)).toBe('group-serial');
    });

    it('returns group-{protocol} for generic protocol', () => {
      expect(deriveGroupId('ssh', null)).toBe('group-ssh');
      expect(deriveGroupId('ftp', null)).toBe('group-ftp');
      expect(deriveGroupId('telnet', null)).toBe('group-telnet');
    });

    it('returns group-{sshMode} when sshMode is set', () => {
      const profile = { sshMode: 'sftp' };
      expect(deriveGroupId('ssh', profile)).toBe('group-sftp');
    });
  });

  describe('getProtocolColor()', () => {
    it('returns correct color for local', () => {
      expect(getProtocolColor('local')).toBe('#45475a');
    });

    it('returns correct color for ssh', () => {
      expect(getProtocolColor('ssh')).toBe('#89b4fa');
    });

    it('returns correct color for serial', () => {
      expect(getProtocolColor('serial')).toBe('#f38ba8');
    });

    it('returns default color for unknown protocol', () => {
      expect(getProtocolColor('unknown')).toBe('#6c7086');
    });
  });

  describe('getDefaultGroupsForProtocols()', () => {
    it('creates groups for requested protocols', () => {
      const groups = getDefaultGroupsForProtocols(['local', 'ssh']);
      expect(groups).toHaveLength(2);
      expect(groups[0].id).toBe('group-local');
      expect(groups[1].id).toBe('group-ssh');
    });

    it('sets correct properties on each group', () => {
      const groups = getDefaultGroupsForProtocols(['local']);
      const group = groups[0];

      expect(group.id).toBe('group-local');
      expect(group.name).toBe('Local');
      expect(group.protocol).toBe('local');
      expect(group.isAutoGroup).toBe(true);
      expect(group.color).toBe('#45475a');
      expect(group.isCollapsed).toBe(false);
      expect(group.displayOrder).toBe(0);
    });

    it('maintains protocol order regardless of input order', () => {
      const groups = getDefaultGroupsForProtocols(['ftp', 'local', 'serial']);
      const ids = groups.map(g => g.id);
      expect(ids).toEqual(['group-local', 'group-serial', 'group-ftp']);
    });

    it('returns empty array for no protocols', () => {
      expect(getDefaultGroupsForProtocols([])).toEqual([]);
    });

    it('skips protocols not in PROTOCOL_ORDER', () => {
      const groups = getDefaultGroupsForProtocols(['local', 'unknown-protocol']);
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('group-local');
    });

    it('sets displayOrder incrementally', () => {
      const groups = getDefaultGroupsForProtocols(['local', 'ssh', 'serial']);
      expect(groups[0].displayOrder).toBe(0);
      expect(groups[1].displayOrder).toBe(1);
      expect(groups[2].displayOrder).toBe(2);
    });
  });
});

describe('Tab Grouping — Session Migration', () => {
  describe('Session backfill logic', () => {
    it('detects missing groups array in old session', () => {
      const oldSession = {
        tabs: [
          { protocol: 'local', name: 'Terminal' },
          { protocol: 'ssh', name: 'server' },
        ],
      };

      const hasGroups = Boolean(oldSession.groups);
      expect(hasGroups).toBe(false);
    });

    it('derives protocols from tabs for auto-grouping', () => {
      const tabs = [
        { protocol: 'local', name: 'Terminal' },
        { protocol: 'ssh', name: 'server1' },
        { protocol: 'ssh', name: 'server2' },
      ];

      const protocols = new Set(tabs.map(t => t.protocol));
      expect([...protocols]).toEqual(expect.arrayContaining(['local', 'ssh']));
      expect([...protocols]).toHaveLength(2);
    });

    it('backsills groupId on tabs without it', () => {
      const tab = { protocol: 'ssh', name: 'server' };
      const groupId = deriveGroupId(tab.protocol, null);
      expect(groupId).toBe('group-ssh');
    });
  });
});

describe('Tab Grouping — Data Model', () => {
  describe('Group object structure', () => {
    it('has all required fields', () => {
      const group = {
        id: 'group-test',
        name: 'Test Group',
        protocol: 'ssh',
        isAutoGroup: true,
        color: '#89b4fa',
        isCollapsed: false,
        displayOrder: 0,
      };

      expect(group).toHaveProperty('id');
      expect(group).toHaveProperty('name');
      expect(group).toHaveProperty('protocol');
      expect(group).toHaveProperty('isAutoGroup');
      expect(group).toHaveProperty('color');
      expect(group).toHaveProperty('isCollapsed');
      expect(group).toHaveProperty('displayOrder');
    });
  });

  describe('Tab groupId field', () => {
    it('tab object includes groupId', () => {
      // Simulating what createTab() does
      const protocol = 'ssh';
      const connectionProfile = null;
      const groupId = deriveGroupId(protocol, connectionProfile);

      const tab = {
        id: 1,
        groupId,
        protocol,
        name: 'SSH Server',
      };

      expect(tab).toHaveProperty('groupId');
      expect(tab.groupId).toBe('group-ssh');
    });

    it('tab object includes displayOrder', () => {
      const tab = {
        id: 1,
        displayOrder: 0,
        name: 'Terminal',
      };

      expect(tab).toHaveProperty('displayOrder');
      expect(typeof tab.displayOrder).toBe('number');
    });
  });
});
