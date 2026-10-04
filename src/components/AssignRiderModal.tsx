import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { assignOrderRider, getOrderRiders, MerchantOrder, OrderRider } from '@/services/api';

export default function AssignRiderModal({ order, onClose, onAssigned }: {
  order: MerchantOrder | null; onClose: () => void; onAssigned: () => void;
}) {
  const [riders, setRiders] = useState<OrderRider[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const savingRef = useRef(false);
  useEffect(() => {
    let active = true;
    setSelected(''); setRiders([]); setError('');
    if (!order) return;
    setLoading(true);
    getOrderRiders(order.storeId).then(result => { if (active) setRiders(result); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Riders could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [order, attempt]);
  const save = async () => {
    if (!order || !selected || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try { await assignOrderRider(order.orderId, selected); onAssigned(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The rider could not be assigned.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <Modal visible={!!order} transparent animationType="fade" onRequestClose={() => { if (!savingRef.current) onClose(); }}>
    <View style={styles.overlay}><View style={styles.dialog} accessibilityViewIsModal>
      <Text style={styles.title}>{order?.status === 'assigned_to_rider' ? 'Reassign Rider' : 'Assign Rider'}</Text>
      <Text style={styles.subtitle}>{order?.orderId}</Text>
      {loading ? <ActivityIndicator style={styles.loader} color="#176B45" /> : <ScrollView style={styles.list}>
        {riders.map(rider => <Pressable key={rider.id} disabled={saving} accessibilityRole="radio" accessibilityState={{ checked: selected === rider.id, disabled: saving }} onPress={() => setSelected(rider.id)} style={[styles.rider, selected === rider.id && styles.selected]}><Text style={styles.name}>{selected === rider.id ? '●' : '○'}  {rider.name}</Text></Pressable>)}
        {!riders.length && !error && <Text style={styles.subtitle}>No riders are available for this store.</Text>}
      </ScrollView>}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!error && !riders.length && <Pressable disabled={loading || saving} onPress={() => setAttempt(value => value + 1)}><Text style={styles.retry}>Retry loading riders</Text></Pressable>}
      <View style={styles.actions}><Pressable disabled={saving} onPress={onClose} style={styles.cancel}><Text>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={!selected || loading || saving} onPress={() => void save()} style={[styles.save, (!selected || loading || saving) && styles.disabled]}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Assign Rider</Text>}</Pressable></View>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, width: '100%', maxWidth: 480, maxHeight: '85%' },
  title: { color: '#173D2D', fontSize: 20, fontWeight: '800' }, subtitle: { color: '#718078', marginVertical: 10 },
  loader: { margin: 30 }, list: { flexGrow: 0, marginVertical: 10 }, rider: { padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#DFE8E2', marginBottom: 8 },
  selected: { borderColor: '#176B45', backgroundColor: '#EDF7F0' }, name: { color: '#173D2D', fontSize: 15 }, error: { color: '#A94442', marginVertical: 8 },
  retry: { color: '#176B45', paddingVertical: 10 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 12 },
  cancel: { padding: 12 }, save: { backgroundColor: '#176B45', borderRadius: 8, padding: 12, minWidth: 120, alignItems: 'center' }, saveText: { color: '#FFF', fontWeight: '700' }, disabled: { opacity: 0.5 },
});
