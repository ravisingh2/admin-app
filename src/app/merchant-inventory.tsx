import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCategories, getMerchantStores, getSelectedProduct, MerchantStore, ProductVariant, saveMerchantInventory } from '@/services/api';

function formatQuantity(quantity: number, unit: string) {
  const unitLabels: Record<string, string> = { grams: 'g', gram: 'g', gm: 'g', kg: 'kg', liter: 'L', ml: 'ml', sticks: ' sticks', Piece: ' pcs', Full: ' full', Half: ' half' };
  return `${quantity ?? ''}${unitLabels[unit] ?? unit}`;
}

export default function MerchantInventoryScreen() {
  const { id, attributeId } = useLocalSearchParams<{ id?: string; attributeId?: string }>();
  const product = getSelectedProduct();
  const [stores, setStores] = useState<MerchantStore[]>([]);
  const [storeId, setStoreId] = useState(0);
  const [storeOpen, setStoreOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [saving, setSaving] = useState(false);
  const [variants] = useState<ProductVariant[]>(() => Object.values(product?.attribute || {}).map((variant) => ({ ...variant })));
  const [inventoryValues, setInventoryValues] = useState(() => Object.values(product?.attribute || {}).map((variant) => ({
    price: String(variant.price ?? ''),
    stock: String(variant.stock ?? ''),
  })));
  const [expandedAttribute, setExpandedAttribute] = useState<number | null>(() => {
    if (!attributeId) return null;
    const index = Object.values(product?.attribute || {}).findIndex((variant) => String(variant.attribute_id || variant.id) === String(attributeId));
    return index >= 0 ? index : null;
  });

  useEffect(() => {
    getMerchantStores().then((items) => {
      setStores(items);
      const existingStore = variants.find((variant) => Number(variant.store_id))?.store_id;
      setStoreId(Number(existingStore || items[0]?.id || 0));
    }).catch((error) => Alert.alert('Could not load stores', error instanceof Error ? error.message : 'Please try again.'));
    getCategories().then((items) => setCategoryName(items.find((category) => Number(category.id) === Number(product?.category_id))?.category_name || '')).catch(() => undefined);
  }, []);

  const selectedStore = useMemo(() => stores.find((store) => store.id === storeId), [stores, storeId]);
  const updateInventoryValue = (index: number, key: 'price' | 'stock', value: string) => {
    const cleaned = key === 'price' ? value.replace(/[^0-9.]/g, '') : value.replace(/[^0-9]/g, '');
    setInventoryValues((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: cleaned } : item));
  };

  const save = async () => {
    if (!product || !storeId) return Alert.alert('Missing store', 'Please select a store.');
    try {
      setSaving(true);
      const inventoryVariants = variants.map((variant, index) => ({
        ...variant,
        price: inventoryValues[index]?.price || '00',
        stock: inventoryValues[index]?.stock || '00',
      }));
      await saveMerchantInventory({ productId: product.product_id, storeId, variants: inventoryVariants });
      inventoryVariants.forEach((updated) => {
        const original = Object.values(product.attribute || {}).find((variant) => Number(variant.attribute_id || variant.id) === Number(updated.attribute_id || updated.id));
        if (original) {
          original.price = Number(updated.price);
          original.stock = Number(updated.stock);
        }
      });
      Alert.alert('Inventory saved', 'The product inventory was updated successfully.');
      router.back();
    } catch (error) {
      Alert.alert('Could not save inventory', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSaving(false); }
  };

  if (!product || String(product.product_id) !== String(id)) return <SafeAreaView style={styles.safe}><View style={styles.empty}><Text style={styles.title}>Product unavailable</Text><Pressable onPress={() => router.back()} style={styles.save}><Text style={styles.saveText}>Back to products</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <View style={[styles.header, styles.headerPolished]}><Pressable onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, styles.headerTextLight]}>‹</Text></Pressable><View><Text style={[styles.title, styles.headerTextLight]}>Manage Inventory</Text><Text style={[styles.breadcrumb, styles.breadcrumbLight]}>Update product price and stock</Text></View></View>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, styles.heroCard]}>
        <View style={styles.productSummaryRow}>
          <View style={styles.heroImage}>{product.image_url ? <Image source={{ uri: product.image_url }} style={styles.heroImageContent} contentFit="cover" /> : <Text style={styles.heroImageText}>{product.product_name.charAt(0).toUpperCase()}</Text>}</View>
          <View style={styles.productDetails}><Text style={styles.productNameLabel}>PRODUCT</Text><Text style={styles.productNameValue} numberOfLines={2}>{product.product_name}</Text><View style={styles.categoryBadge}><Text style={styles.categoryBadgeIcon}>●</Text><Text style={styles.categoryBadgeText} numberOfLines={1}>{categoryName || `Category ${product.category_id || ''}`}</Text></View></View>
          <Pressable onPress={() => setStoreOpen(true)} style={styles.compactStore}><Text style={styles.compactStoreLabel}>STORE</Text><View style={styles.compactStoreValueRow}><Text style={styles.compactStoreValue} numberOfLines={1}>{selectedStore?.store_name || 'Select'}</Text><Text style={styles.compactStoreArrow}>⌄</Text></View></Pressable>
        </View>
      </View>
      {variants.map((variant, index) => {
        const expanded = expandedAttribute === index;
        return <View key={`${variant.attribute_id || variant.id}-${index}`} style={[styles.accordion, styles.accordionPolished]}>
          <Pressable onPress={() => setExpandedAttribute(expanded ? null : index)} style={[styles.accordionHeader, styles.accordionHeaderPolished, expanded && styles.accordionHeaderOpen]}>
            <Text style={styles.attributeTitle}>{variant.attribute_name || `Attribute ${index + 1}`}</Text>
            <Text style={styles.accordionArrow}>{expanded ? '⌃' : '⌄'}</Text>
          </Pressable>
          {expanded && <View style={styles.accordionBody}>
            <View style={styles.attributeMeta}><Text style={styles.metaLabel}>Quantity: <Text style={styles.metaValue}>{formatQuantity(variant.quantity, variant.unit)}</Text></Text></View>
            <View style={styles.row}><View style={styles.half}><Text style={styles.label}>Price</Text><View style={styles.inputShell}><View style={styles.inputPrefix}><Text style={styles.inputPrefixText}>₹</Text></View><TextInput keyboardType="decimal-pad" value={inventoryValues[index]?.price ?? ''} onChangeText={(value) => updateInventoryValue(index, 'price', value)} style={styles.inputPolished} placeholder="0.00" placeholderTextColor="#9BA8A2" selectionColor="#176B45" /></View></View><View style={styles.half}><Text style={styles.label}>Items in Store</Text><View style={styles.inputShell}><View style={styles.inputPrefix}><Text style={styles.inputPrefixText}>#</Text></View><TextInput keyboardType="number-pad" value={inventoryValues[index]?.stock ?? ''} onChangeText={(value) => updateInventoryValue(index, 'stock', value)} style={styles.inputPolished} placeholder="0" placeholderTextColor="#9BA8A2" selectionColor="#176B45" /></View></View></View>
          </View>}
        </View>;
      })}
      <View style={[styles.actions, styles.actionsPolished]}><Pressable disabled={saving} onPress={() => router.back()} style={[styles.cancel, styles.cancelPolished]}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable disabled={saving} onPress={save} style={[styles.save, styles.savePolished]}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save Inventory</Text>}</Pressable></View>
    </ScrollView>
    <Modal visible={storeOpen} transparent animationType="fade" onRequestClose={() => setStoreOpen(false)}><Pressable style={styles.overlay} onPress={() => setStoreOpen(false)}><View style={styles.modal}><Text style={styles.cardTitle}>Select Store</Text>{stores.map((store) => <Pressable key={store.id} onPress={() => { setStoreId(store.id); setStoreOpen(false); }} style={styles.option}><Text>{store.store_name}</Text>{store.id === storeId && <Text style={styles.check}>✓</Text>}</Pressable>)}</View></Pressable></Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ECF0F5' }, header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#D2D6DE' }, back: { width: 42 }, backText: { fontSize: 34, color: '#444' }, title: { fontSize: 23, fontWeight: '600', color: '#333' }, breadcrumb: { fontSize: 11, color: '#888', marginTop: 3 }, page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 14, paddingBottom: 40 }, card: { backgroundColor: '#FFF', borderTopWidth: 3, borderTopColor: '#3C8DBC', padding: 16, marginBottom: 14, borderRadius: 3 }, cardTitle: { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 14 }, sectionLabel: { color: '#777', marginBottom: 16 }, productSummaryRow: { flexDirection: 'row', gap: 12 }, summaryItem: { flex: 1, minWidth: 0, backgroundColor: '#F7F7F7', borderWidth: 1, borderColor: '#E2E5E7', paddingHorizontal: 11, paddingVertical: 9 }, summaryLabel: { color: '#777', fontSize: 10, fontWeight: '700', marginBottom: 3 }, summaryValue: { color: '#333', fontSize: 13, fontWeight: '600' }, accordion: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDE3E7', borderRadius: 4, marginBottom: 12, overflow: 'hidden' }, accordionHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderLeftWidth: 4, borderLeftColor: '#3C8DBC' }, accordionHeaderOpen: { backgroundColor: '#F2F8FB' }, attributeTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#3C8DBC' }, accordionArrow: { color: '#3C8DBC', fontSize: 20, fontWeight: '700', marginLeft: 12 }, accordionBody: { padding: 16, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#E7ECEF' }, attributeMeta: { flexDirection: 'row', gap: 24, marginBottom: 14 }, metaLabel: { color: '#777', fontSize: 12, fontWeight: '600' }, metaValue: { color: '#333', fontWeight: '800' }, label: { color: '#444', fontSize: 12, fontWeight: '700', marginBottom: 7 }, select: { height: 42, borderWidth: 1, borderColor: '#D2D6DE', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, marginBottom: 14 }, selectText: { flex: 1 }, readonly: { minHeight: 42, borderWidth: 1, borderColor: '#E2E5E7', backgroundColor: '#F7F7F7', paddingHorizontal: 11, justifyContent: 'center', marginBottom: 14 }, input: { height: 42, borderWidth: 1, borderColor: '#D2D6DE', paddingHorizontal: 11, marginBottom: 14, backgroundColor: '#FFF' }, row: { flexDirection: 'row', gap: 12 }, half: { flex: 1 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }, cancel: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#DDD', borderRadius: 3 }, save: { minWidth: 90, alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#00A65A', borderRadius: 3 }, saveText: { color: '#FFF', fontWeight: '700' }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 }, overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'center', padding: 24 }, modal: { backgroundColor: '#FFF', borderRadius: 5, padding: 16, maxWidth: 460, width: '100%', alignSelf: 'center' }, option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EEE' }, check: { marginLeft: 'auto', color: '#3C8DBC', fontWeight: '900' },
  headerPolished: { minHeight: 66, backgroundColor: '#176B45', borderBottomColor: '#145D3D' }, headerTextLight: { color: '#FFF' }, breadcrumbLight: { color: '#CDE7D7' }, heroCard: { borderTopWidth: 0, borderRadius: 12, borderWidth: 1, borderColor: '#E1EAE4', padding: 9, shadowColor: '#173D2D', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }, heroImage: { width: 44, height: 44, borderRadius: 9, overflow: 'hidden', backgroundColor: '#E6F3EA', alignItems: 'center', justifyContent: 'center' }, heroImageContent: { width: '100%', height: '100%' }, heroImageText: { color: '#176B45', fontSize: 18, fontWeight: '900' }, productDetails: { flex: 1, minWidth: 80, justifyContent: 'center' }, productNameLabel: { color: '#83948B', fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginBottom: 1 }, productNameValue: { color: '#173E2D', fontSize: 14, lineHeight: 16, fontWeight: '800', marginBottom: 3 }, categoryBadge: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 12, backgroundColor: '#E8F3ED' }, categoryBadgeIcon: { color: '#39A36C', fontSize: 6 }, categoryBadgeText: { flexShrink: 1, color: '#176B45', fontSize: 9, fontWeight: '700' }, compactStore: { width: 112, minHeight: 44, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 9, borderWidth: 1, borderColor: '#CFE1D7', backgroundColor: '#F5FAF7' }, compactStoreLabel: { color: '#83948B', fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginBottom: 2 }, compactStoreValueRow: { flexDirection: 'row', alignItems: 'center' }, compactStoreValue: { flex: 1, color: '#176B45', fontSize: 11, fontWeight: '800' }, compactStoreArrow: { color: '#176B45', fontSize: 14, marginLeft: 4 }, accordionPolished: { borderRadius: 12, borderColor: '#E1EAE4', shadowColor: '#173D2D', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }, accordionHeaderPolished: { minHeight: 58, borderLeftColor: '#3E9A6D' }, actionsPolished: { backgroundColor: '#FFF', borderRadius: 13, padding: 10, borderWidth: 1, borderColor: '#E1EAE4' }, cancelPolished: { flex: 1, alignItems: 'center', borderRadius: 9, backgroundColor: '#EEF2EF' }, cancelText: { color: '#506159', fontWeight: '800' }, savePolished: { flex: 1.6, borderRadius: 9, backgroundColor: '#176B45' }, inputShell: { height: 50, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: '#D8E4DE', borderRadius: 12, backgroundColor: '#F8FBF9', marginBottom: 16 }, inputPrefix: { width: 42, height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F3ED', borderRightWidth: 1, borderRightColor: '#D8E4DE' }, inputPrefixText: { color: '#176B45', fontSize: 16, fontWeight: '800' }, inputPolished: { flex: 1, height: '100%', paddingHorizontal: 13, color: '#173E2D', fontSize: 16, fontWeight: '700' },
});
