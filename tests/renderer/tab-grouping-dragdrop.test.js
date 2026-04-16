const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/js/app.js'),
  'utf-8'
);

describe('Tab Grouping — Drag-Drop (source contracts)', () => {
  describe('Group drop detection', () => {
    it('uses elementFromPoint to find target group on drop', () => {
      expect(source).toContain("document.elementFromPoint(ev.clientX, ev.clientY)");
      expect(source).toContain("?.closest('.tab-group')");
    });

    it('checks targetGroupId !== tab.groupId before reassigning', () => {
      expect(source).toContain("targetGroupId !== tab.groupId");
    });

    it('updates tab.groupId on drop into new group', () => {
      expect(source).toContain("tab.groupId = targetGroupId");
    });

    it('auto-expands collapsed target group on drop', () => {
      expect(source).toContain("delete state.collapsedGroups[targetGroupId]");
    });

    it('recalculates displayOrder within new group after drop', () => {
      expect(source).toContain("t.groupId === targetGroupId");
      expect(source).toContain("t.displayOrder = idx");
    });

    it('calls renderTabBar() after group reassignment', () => {
      // Verify renderTabBar is called in the drag-drop onUp handler context
      const onUpBlock = source.match(/const onUp = async.*?}\s*};/s);
      expect(onUpBlock).not.toBeNull();
      expect(onUpBlock[0]).toContain('renderTabBar()');
    });

    it('persists session after group drop', () => {
      const onUpBlock = source.match(/const onUp = async.*?}\s*};/s);
      expect(onUpBlock).not.toBeNull();
      expect(onUpBlock[0]).toContain('saveSessionSync');
    });
  });

  describe('Group highlight during drag', () => {
    it('adds drop-target class to group on hover', () => {
      expect(source).toContain("classList.add('drop-target')");
    });

    it('removes drop-target class from previously highlighted group', () => {
      expect(source).toContain("classList.remove('drop-target')");
    });

    it('tracks lastHighlightedGroup to avoid flicker', () => {
      expect(source).toContain('lastHighlightedGroup');
    });

    it('clears group highlight on tearoff mode', () => {
      // When tearOff = true, highlight should be cleared
      const onMoveBlock = source.match(/const onMove = \(ev\).*?}\s*};/s);
      expect(onMoveBlock).not.toBeNull();
      expect(onMoveBlock[0]).toContain("classList.remove('drop-target')");
    });

    it('clears group highlight on mouseup', () => {
      // onUp should always clear lastHighlightedGroup
      const onUpBlock = source.match(/const onUp = async.*?}\s*};/s);
      expect(onUpBlock).not.toBeNull();
      expect(onUpBlock[0]).toContain("lastHighlightedGroup.classList.remove('drop-target')");
    });
  });

  describe('CSS drop-target class', () => {
    it('drop-target class defined in CSS', () => {
      const css = fs.readFileSync(
        path.join(__dirname, '../../src/renderer/css/style.css'),
        'utf-8'
      );
      expect(css).toContain('.tab-group.drop-target');
    });
  });
});

describe('Tab Grouping — Group state helpers (simulation)', () => {
  // Simulate group reassignment logic
  function simulateGroupReassignment(tabs, tab, targetGroupId) {
    const oldGroupId = tab.groupId;
    if (targetGroupId === oldGroupId) return false;

    tab.groupId = targetGroupId;

    // Recalculate displayOrder within new group
    const tabsInNewGroup = tabs.filter(t => t.groupId === targetGroupId);
    tabsInNewGroup.forEach((t, idx) => { t.displayOrder = idx; });

    return true;
  }

  it('reassigns tab to new group', () => {
    const tabs = [
      { id: 1, groupId: 'group-local', displayOrder: 0 },
      { id: 2, groupId: 'group-ssh', displayOrder: 0 },
    ];

    const result = simulateGroupReassignment(tabs, tabs[0], 'group-ssh');
    expect(result).toBe(true);
    expect(tabs[0].groupId).toBe('group-ssh');
  });

  it('does not reassign when groupId unchanged', () => {
    const tabs = [
      { id: 1, groupId: 'group-local', displayOrder: 0 },
    ];

    const result = simulateGroupReassignment(tabs, tabs[0], 'group-local');
    expect(result).toBe(false);
    expect(tabs[0].groupId).toBe('group-local');
  });

  it('recalculates displayOrder in target group after drop', () => {
    const tabs = [
      { id: 1, groupId: 'group-ssh', displayOrder: 0 },
      { id: 2, groupId: 'group-ssh', displayOrder: 1 },
      { id: 3, groupId: 'group-local', displayOrder: 0 },
    ];

    simulateGroupReassignment(tabs, tabs[2], 'group-ssh');

    // After moving tab 3 to group-ssh, displayOrder should be 0,1,2
    const sshTabs = tabs.filter(t => t.groupId === 'group-ssh');
    expect(sshTabs).toHaveLength(3);
    sshTabs.sort((a, b) => a.displayOrder - b.displayOrder);
    expect(sshTabs[0].displayOrder).toBe(0);
    expect(sshTabs[1].displayOrder).toBe(1);
    expect(sshTabs[2].displayOrder).toBe(2);
  });
});
