const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/js/app.js'),
  'utf-8'
);
const html = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/index.html'),
  'utf-8'
);

describe('Tab Grouping — Settings UI (source contracts)', () => {
  describe('HTML structure', () => {
    it('has Tab Organization settings section', () => {
      expect(html).toContain('Tab Organization');
    });

    it('has auto-group toggle checkbox', () => {
      expect(html).toContain('id="settings-auto-group"');
    });

    it('has groups-list-container', () => {
      expect(html).toContain('id="groups-list-container"');
    });

    it('has Create Custom Group button', () => {
      expect(html).toContain('id="btn-create-group"');
    });
  });

  describe('renderGroupsList()', () => {
    it('renderGroupsList function is defined', () => {
      expect(source).toContain('function renderGroupsList()');
    });

    it('renders group color swatch', () => {
      const block = source.match(/function renderGroupsList\(\)[\s\S]{0,2000}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain('group-color-swatch');
    });

    it('renders group name input', () => {
      const block = source.match(/function renderGroupsList\(\)[\s\S]{0,2000}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain('group-name-input');
    });

    it('saves session on group rename (blur)', () => {
      const block = source.match(/function renderGroupsList\(\)[\s\S]{0,2000}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain("'blur'");
      expect(block[0]).toContain('saveSessionSync');
    });

    it('shows delete button for non-auto-groups only', () => {
      const block = source.match(/function renderGroupsList\(\)[\s\S]{0,2000}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain('!group.isAutoGroup');
    });

    it('shows auto badge for auto-groups', () => {
      const block = source.match(/function renderGroupsList\(\)[\s\S]{0,2000}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain("'auto'");
    });
  });

  describe('showCreateGroupDialog()', () => {
    it('showCreateGroupDialog function is defined', () => {
      expect(source).toContain('function showCreateGroupDialog()');
    });

    it('creates group with isAutoGroup: false', () => {
      const block = source.match(/function showCreateGroupDialog\(\)[\s\S]{0,3000}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain('isAutoGroup: false');
    });

    it('assigns displayOrder based on groups.length', () => {
      const block = source.match(/function showCreateGroupDialog\(\)[\s\S]{0,3000}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain('state.groups.length');
    });

    it('calls renderTabBar after creating group', () => {
      const block = source.match(/function showCreateGroupDialog\(\)[\s\S]{0,3000}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain('renderTabBar()');
    });

    it('persists session after creating group', () => {
      const block = source.match(/function showCreateGroupDialog\(\)[\s\S]{0,3000}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain('saveSessionSync');
    });
  });

  describe('deleteGroup()', () => {
    it('deleteGroup function is defined', () => {
      expect(source).toContain('function deleteGroup(groupId)');
    });

    it('protects auto-groups from deletion', () => {
      const block = source.match(/function deleteGroup\(groupId\)[\s\S]{0,500}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain('group.isAutoGroup');
    });

    it('moves tabs to remaining group before deleting', () => {
      const block = source.match(/function deleteGroup\(groupId\)[\s\S]{0,500}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain('remaining.id');
    });

    it('filters deleted group from state.groups', () => {
      const block = source.match(/function deleteGroup\(groupId\)[\s\S]{0,500}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain('state.groups.filter');
    });
  });

  describe('Auto-group toggle in openSettings()', () => {
    it('reads settings-auto-group checkbox', () => {
      expect(source).toContain("getElementById('settings-auto-group')");
    });

    it('applies autoGroupByProtocol to state.settings', () => {
      expect(source).toContain('state.settings.autoGroupByProtocol');
    });

    it('flattens tabs to group-other when auto-group disabled', () => {
      expect(source).toContain("'group-other'");
    });

    it('calls renderGroupsList from openSettings', () => {
      const block = source.match(/async function openSettings\(\)[\s\S]{0,3000}/);
      expect(block).not.toBeNull();
      expect(block[0]).toContain('renderGroupsList()');
    });
  });
});

describe('Tab Grouping — deleteGroup simulation', () => {
  function deleteGroup(groups, tabs, groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group || group.isAutoGroup) return { groups, tabs };

    const remaining = groups.find(g => g.id !== groupId);
    if (remaining) {
      tabs.filter(t => t.groupId === groupId).forEach(t => { t.groupId = remaining.id; });
    }

    return {
      groups: groups.filter(g => g.id !== groupId),
      tabs,
    };
  }

  it('removes group from list', () => {
    const groups = [
      { id: 'group-ssh', name: 'SSH', isAutoGroup: true },
      { id: 'group-custom', name: 'Custom', isAutoGroup: false },
    ];
    const tabs = [{ id: 1, groupId: 'group-custom' }];

    const result = deleteGroup(groups, tabs, 'group-custom');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].id).toBe('group-ssh');
  });

  it('moves tabs to remaining group', () => {
    const groups = [
      { id: 'group-ssh', name: 'SSH', isAutoGroup: true },
      { id: 'group-custom', name: 'Custom', isAutoGroup: false },
    ];
    const tabs = [{ id: 1, groupId: 'group-custom' }];

    const result = deleteGroup(groups, tabs, 'group-custom');
    expect(result.tabs[0].groupId).toBe('group-ssh');
  });

  it('refuses to delete auto-group', () => {
    const groups = [{ id: 'group-ssh', name: 'SSH', isAutoGroup: true }];
    const tabs = [];

    const result = deleteGroup(groups, tabs, 'group-ssh');
    expect(result.groups).toHaveLength(1);
  });
});
