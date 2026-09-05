import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Category, EditableProduct, getCategories, getProductListFilters, getSelectedProduct, saveProduct } from '@/services/api';

const UNIT_OPTIONS = [
  { value: 'grams', label: 'Grams' }, { value: 'liter', label: 'Liter' },
  { value: 'kg', label: 'Kg' }, { value: 'ml', label: 'ML' },
  { value: 'sticks', label: 'Sticks' }, { value: 'Piece', label: 'Piece' },
  { value: 'Full', label: 'Full' }, { value: 'Half', label: 'Half' },
];

function normalizeUnit(unit: string) {
  const legacyUnits: Record<string, string> = { gm: 'grams', gram: 'grams', piece: 'Piece', full: 'Full', half: 'Half' };
  return legacyUnits[unit] || unit;
}

function Field({ label, value, onChangeText, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} multiline={multiline} style={[styles.input, multiline && styles.textarea]} /></View>;
}

function Toggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.toggleRow}><View style={[styles.checkbox, active && styles.checkboxActive]}>{active && <Text style={styles.check}>✓</Text>}</View><Text style={styles.toggleLabel}>{label}</Text></Pressable>;
}

export default function EditProductScreen() {
  const { id, listProductName, listCategoryId } = useLocalSearchParams<{ id?: string; listProductName?: string; listCategoryId?: string }>();
  const source = getSelectedProduct();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [unitAttributeIndex, setUnitAttributeIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditableProduct | null>(() => {
    if (!source || String(source.product_id) !== String(id)) return null;
    return {
      id: source.product_id,
      product_name: source.product_name || '',
      category_id: Number(source.category_id || 0),
      item_code: source.item_code || '',
      product_desc: source.product_desc || '',
      nutrition: source.nutrition || '',
      brand_name: source.brand_name || '',
      status: Number(source.status ?? 1),
      hotdeals: Number(source.hotdeals || 0),
      offers: Number(source.offers || 0),
      new_arrival: Number(source.new_arrival || 0),
      promotion_id: Number(source.promotion_id || 0), tax_id: Number(source.tax_id || 0),
      discount_type: source.discount_type || '', discount_value: source.discount_value || '',
      attributes: Object.values(source.attribute || {}).map((attribute) => ({
        id: attribute.id, name: attribute.attribute_name || '', quantity: String(attribute.quantity ?? ''), unit: normalizeUnit(attribute.unit || ''), status: attribute.status,
        commission_type: attribute.commission_type, commission_value: attribute.commission_value,
        discount_type: attribute.discount_type, discount_value: attribute.discount_value,
      })),
    };
  });

  useEffect(() => { getCategories().then(setCategories).catch(() => setCategories([])); }, []);
  const categoryName = useMemo(() => categories.find((category) => Number(category.id) === form?.category_id)?.category_name, [categories, form?.category_id]);
  const update = <K extends keyof EditableProduct>(key: K, value: EditableProduct[K]) => setForm((current) => current ? { ...current, [key]: value } : current);
  const updateAttribute = (index: number, key: 'name' | 'quantity' | 'unit', value: string) => setForm((current) => current ? { ...current, attributes: current.attributes.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) } : current);
  const removeAttribute = (index: number) => setForm((current) => current ? { ...current, attributes: current.attributes.filter((_, itemIndex) => itemIndex !== index) } : current);

  const handleSave = async () => {
    if (!form?.product_name.trim() || !form.category_id) return Alert.alert('Missing details', 'Product name and category are required.');
    if (!form.attributes.length || form.attributes.some((item) => !item.name.trim() || !item.quantity || !item.unit.trim())) return Alert.alert('Missing details', 'Complete the name, quantity, and unit for every attribute.');
    try {
      setSaving(true);
      await saveProduct(form);
      Alert.alert('Product updated', 'The product and its attributes were saved successfully.');
      const savedListFilters = getProductListFilters();
      router.replace({
        pathname: '/products',
        params: {
          productName: listProductName ?? savedListFilters.productName,
          categoryId: listCategoryId ?? (savedListFilters.categoryId == null ? '' : String(savedListFilters.categoryId)),
        },
      });
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSaving(false); }
  };

  if (!form) return <SafeAreaView style={styles.safeArea}><View style={styles.empty}><Text style={styles.emptyTitle}>Product details unavailable</Text><Text style={styles.emptyText}>Return to the product list and tap Edit again.</Text><Pressable onPress={() => router.back()} style={styles.primaryButton}><Text style={styles.primaryText}>Back to products</Text></Pressable></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><View><Text style={styles.title}>Edit Product</Text><Text style={styles.breadcrumb}>Product / Edit #{form.id}</Text></View></View>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Product details</Text>
          {source?.image_url && <Image source={{ uri: source.image_url }} style={styles.image} contentFit="contain" />}
          <Field label="Product Name *" value={form.product_name} onChangeText={(value) => update('product_name', value)} />
          <Text style={styles.label}>Category *</Text>
          <Pressable onPress={() => setCategoryOpen(true)} style={styles.select}><Text style={styles.selectText}>{categoryName || 'Select category'}</Text><Text>⌄</Text></Pressable>
          <Field label="Item Code" value={form.item_code} onChangeText={(value) => update('item_code', value)} />
          <Field label="Brand Name" value={form.brand_name} onChangeText={(value) => update('brand_name', value)} />
          <Field label="Product Description" value={form.product_desc} onChangeText={(value) => update('product_desc', value)} multiline />
          <Field label="Nutrition" value={form.nutrition} onChangeText={(value) => update('nutrition', value)} multiline />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}><Text style={styles.cardTitle}>Attributes</Text><Pressable onPress={() => update('attributes', [...form.attributes, { name: '', quantity: '', unit: 'grams' }])} style={styles.addAttribute}><Text style={styles.addAttributeText}>＋ Add Attribute</Text></Pressable></View>
          {form.attributes.map((attribute, index) => <View key={attribute.id || `new-${index}`} style={styles.attributeCard}>
            <View style={styles.attributeHeading}><Text style={styles.attributeTitle}>Attribute {index + 1}</Text>{form.attributes.length > 1 && <Pressable onPress={() => removeAttribute(index)}><Text style={styles.remove}>Remove</Text></Pressable>}</View>
            <Field label="Attribute Name *" value={attribute.name} onChangeText={(value) => updateAttribute(index, 'name', value)} />
            <View style={styles.twoColumns}>
              <View style={styles.half}><Field label="Quantity *" value={attribute.quantity} onChangeText={(value) => updateAttribute(index, 'quantity', value)} /></View>
              <View style={styles.half}><Text style={styles.label}>Unit *</Text><Pressable onPress={() => setUnitAttributeIndex(index)} style={styles.select}><Text style={styles.selectText}>{UNIT_OPTIONS.find((unit) => unit.value === attribute.unit)?.label || attribute.unit || 'Select unit'}</Text><Text>⌄</Text></Pressable></View>
            </View>
          </View>)}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Visibility and status</Text>
          <Toggle label="Hot Deals" active={form.hotdeals === 1} onPress={() => update('hotdeals', form.hotdeals ? 0 : 1)} />
          <Toggle label="New Offers" active={form.offers === 1} onPress={() => update('offers', form.offers ? 0 : 1)} />
          <Toggle label="New Arrival" active={form.new_arrival === 1} onPress={() => update('new_arrival', form.new_arrival ? 0 : 1)} />
          <Text style={styles.label}>Product Status</Text><View style={styles.statusRow}><Pressable onPress={() => update('status', 1)} style={[styles.statusButton, form.status === 1 && styles.statusActive]}><Text style={[styles.statusText, form.status === 1 && styles.statusTextActive]}>Active</Text></Pressable><Pressable onPress={() => update('status', 0)} style={[styles.statusButton, form.status === 0 && styles.statusActive]}><Text style={[styles.statusText, form.status === 0 && styles.statusTextActive]}>Inactive</Text></Pressable></View>
        </View>

        <View style={styles.actions}><Pressable disabled={saving} onPress={() => router.back()} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable disabled={saving} onPress={handleSave} style={[styles.saveButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save Product</Text>}</Pressable></View>
      </ScrollView>

      <Modal visible={categoryOpen} transparent animationType="fade" onRequestClose={() => setCategoryOpen(false)}><Pressable style={styles.overlay} onPress={() => setCategoryOpen(false)}><View style={styles.modal}><Text style={styles.modalTitle}>Select category</Text><ScrollView>{categories.map((category) => <Pressable key={category.id} onPress={() => { update('category_id', Number(category.id)); setCategoryOpen(false); }} style={styles.option}><Text style={styles.optionText}>{category.category_name}</Text>{form.category_id === Number(category.id) && <Text style={styles.optionCheck}>✓</Text>}</Pressable>)}</ScrollView></View></Pressable></Modal>
      <Modal visible={unitAttributeIndex !== null} transparent animationType="fade" onRequestClose={() => setUnitAttributeIndex(null)}><Pressable style={styles.overlay} onPress={() => setUnitAttributeIndex(null)}><View style={styles.modal}><Text style={styles.modalTitle}>Select unit</Text>{UNIT_OPTIONS.map((unit) => { const active = unitAttributeIndex !== null && form.attributes[unitAttributeIndex]?.unit === unit.value; return <Pressable key={unit.value} onPress={() => { if (unitAttributeIndex !== null) updateAttribute(unitAttributeIndex, 'unit', unit.value); setUnitAttributeIndex(null); }} style={[styles.option, active && styles.optionActive]}><Text style={[styles.optionText, active && styles.optionTextActive]}>{unit.label}</Text>{active && <Text style={styles.optionCheck}>✓</Text>}</Pressable>; })}</View></Pressable></Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ECF0F5' }, header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#D2D6DE' }, back: { width: 40, height: 40, justifyContent: 'center', marginRight: 8 }, backText: { fontSize: 34, color: '#444' }, title: { fontSize: 23, color: '#333', fontWeight: '600' }, breadcrumb: { fontSize: 11, color: '#888', marginTop: 2 }, page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 14, paddingBottom: 35 },
  card: { backgroundColor: '#FFF', borderTopWidth: 3, borderTopColor: '#3C8DBC', borderRadius: 3, padding: 16, marginBottom: 14 }, cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, cardTitle: { color: '#333', fontSize: 17, fontWeight: '700', marginBottom: 16 }, image: { width: 110, height: 110, alignSelf: 'center', marginBottom: 16, backgroundColor: '#F7F7F7', borderRadius: 4 }, field: { marginBottom: 14 }, label: { color: '#444', fontSize: 12, fontWeight: '700', marginBottom: 7 }, input: { minHeight: 42, borderWidth: 1, borderColor: '#D2D6DE', borderRadius: 2, paddingHorizontal: 11, color: '#333', fontSize: 13, backgroundColor: '#FFF' }, textarea: { minHeight: 84, paddingTop: 10, textAlignVertical: 'top' }, select: { height: 42, borderWidth: 1, borderColor: '#D2D6DE', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, marginBottom: 14 }, selectText: { flex: 1, color: '#333', fontSize: 13 },
  addAttribute: { backgroundColor: '#00A65A', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 3, marginBottom: 12 }, addAttributeText: { color: '#FFF', fontSize: 11, fontWeight: '700' }, attributeCard: { backgroundColor: '#F8FAFB', borderWidth: 1, borderColor: '#E3E7EA', padding: 12, marginBottom: 12 }, attributeHeading: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }, attributeTitle: { color: '#555', fontWeight: '700', fontSize: 13 }, remove: { color: '#DD4B39', fontSize: 11, fontWeight: '700' }, twoColumns: { flexDirection: 'row', gap: 10 }, half: { flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }, checkbox: { width: 20, height: 20, borderWidth: 1, borderColor: '#AAA', alignItems: 'center', justifyContent: 'center', marginRight: 9 }, checkboxActive: { backgroundColor: '#3C8DBC', borderColor: '#3C8DBC' }, check: { color: '#FFF', fontWeight: '900' }, toggleLabel: { color: '#444', fontSize: 13 }, statusRow: { flexDirection: 'row', gap: 8, marginBottom: 4 }, statusButton: { flex: 1, borderWidth: 1, borderColor: '#CCC', alignItems: 'center', paddingVertical: 11 }, statusActive: { backgroundColor: '#3C8DBC', borderColor: '#3C8DBC' }, statusText: { color: '#555', fontSize: 12, fontWeight: '700' }, statusTextActive: { color: '#FFF' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }, cancelButton: { paddingHorizontal: 22, paddingVertical: 13, backgroundColor: '#DDD', borderRadius: 3 }, cancelText: { color: '#444', fontWeight: '700' }, saveButton: { minWidth: 130, alignItems: 'center', paddingHorizontal: 22, paddingVertical: 13, backgroundColor: '#3C8DBC', borderRadius: 3 }, saveText: { color: '#FFF', fontWeight: '700' }, disabled: { opacity: 0.6 },
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.4)', padding: 24 }, modal: { width: '100%', maxWidth: 430, maxHeight: '72%', alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 5, paddingVertical: 8 }, modalTitle: { fontSize: 17, fontWeight: '700', color: '#333', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EEE' }, option: { minHeight: 45, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' }, optionActive: { backgroundColor: '#EAF4F9' }, optionText: { flex: 1, color: '#444', fontSize: 13 }, optionTextActive: { color: '#247BA5', fontWeight: '700' }, optionCheck: { color: '#3C8DBC', fontWeight: '900' }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }, emptyTitle: { fontSize: 19, color: '#333', fontWeight: '700' }, emptyText: { color: '#777', marginTop: 8, textAlign: 'center' }, primaryButton: { backgroundColor: '#3C8DBC', marginTop: 18, paddingHorizontal: 20, paddingVertical: 12 }, primaryText: { color: '#FFF', fontWeight: '700' },
});
