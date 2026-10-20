import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../auth';
import ApprovalsScreen from './approvals';
import RolesScreen from './roles';

const C = {
  bg: '#F7F7F3',
  ink: '#18181B',
  mint: '#7DE2C0',
  card: '#FFFFFF',
  line: '#E4E4E7',
};

export default function AdminScreen() {
  const { can } = useAuth();
  const showApprovals = can('approveUsers');
  const showRoles = can('viewRoles') || can('manageRoles');
  const [tab, setTab] = useState<'approvals' | 'roles'>(showApprovals ? 'approvals' : 'roles');

  const active = tab === 'approvals' && showApprovals ? 'approvals' : showRoles ? 'roles' : 'approvals';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={styles.tabs}>
        <View style={styles.tabsInner}>
          {showApprovals ? (
            <TouchableOpacity
              style={[styles.tab, active === 'approvals' && styles.tabOn]}
              onPress={() => setTab('approvals')}
            >
              <Text style={styles.tabText}>Approvals</Text>
            </TouchableOpacity>
          ) : null}
          {showRoles ? (
            <TouchableOpacity
              style={[styles.tab, active === 'roles' && styles.tabOn]}
              onPress={() => setTab('roles')}
            >
              <Text style={styles.tabText}>Roles</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {active === 'approvals' ? <ApprovalsScreen /> : <RolesScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    backgroundColor: C.bg,
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  tabsInner: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  tab: {
    backgroundColor: '#F0F0EA',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  tabOn: { backgroundColor: C.mint },
  tabText: { color: C.ink, fontWeight: '800', fontSize: 14 },
});