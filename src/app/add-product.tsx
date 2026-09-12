import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createProduct, getAuthenticatedRoleId, getNewProductOptions, isAuthenticated, setProductListFilters, setProductListScrollOffset } from '@/services/api';
import { blankAttribute, blankProduct, NewProduct, NewProductAttribute, PRODUCT_UNITS, ProductFormOptions, ProductOption, ProductPhoto } from '@/services/product-form';

const DISCOUNTS = [{ value: '', label: 'None' }, { value: 'flat', label: 'Flat amount' }, { value: 'percent', label: 'Percentage' }];

function Field({ label, value, onChange, placeholder, multiline, numeric }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; numeric?: boolean }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#92A096" multiline={multiline} keyboardType={numeric ? 'decimal-pad' : 'default'} style={[s.input, multiline && s.textarea]} /></View>;
}

function Choice({ label, value, options, onChange, placeholder = 'Choose an option' }: { label: string; value: string; options: ProductOption[]; onChange: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value);
  return <View style={s.field}><Text style={s.label}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { setQuery(''); setOpen(true); }} style={s.select}><Text style={[s.selectText, !selected && s.placeholder]}>{selected?.label || placeholder}</Text><Text style={s.chevron}>⌄</Text></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><View style={s.overlay}><View style={s.modal}><View style={s.modalHeading}><Text style={s.sectionTitle}>{label}</Text><Pressable accessibilityLabel="Close options" onPress={() => setOpen(false)} style={s.close}><Text style={s.closeText}>×</Text></Pressable></View>{options.length > 8 && <TextInput accessibilityLabel="Search options" placeholder="Search…" value={query} onChangeText={setQuery} style={[s.input, s.search]} />}<ScrollView keyboardShouldPersistTaps="handled">{options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())).map((option) => <Pressable key={option.value} accessibilityRole="button" onPress={() => { onChange(option.value); setOpen(false); }} style={[s.option, option.value === value && s.optionSelected]}><Text style={s.optionText}>{option.label}</Text>{option.value === value && <Text style={s.optionCheck}>✓</Text>}</Pressable>)}{!options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())).length && <Text style={s.hint}>No options found.</Text>}</ScrollView></View></View></Modal>
  </View>;
}

function Photos({ label, photos, onChange, single = false }: { label: string; photos: ProductPhoto[]; onChange: (photos: ProductPhoto[]) => void; single?: boolean }) {
  const [error, setError] = useState('');
  const pick = async () => {
    try {
      setError('');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: !single, quality: 0.85 });
      if (result.canceled) return;
      const selected = result.assets.map((asset) => ({ uri: asset.uri, name: asset.fileName || `photo-${Date.now()}.jpg`, mimeType: asset.mimeType || 'image/jpeg', file: asset.file }));
      onChange(single ? selected.slice(0, 1) : [...photos, ...selected]);
    } catch { setError('Photos could not be opened. Please try again.'); }
  };
  return <View style={s.field}><Text style={s.label}>{label}</Text><View style={s.photos}>{photos.map((photo, index) => <View key={`${photo.uri}-${index}`} style={s.photoWrap}><Image source={{ uri: photo.uri }} style={s.photo} contentFit="cover" /><Pressable accessibilityLabel={`Remove ${label.toLowerCase()} ${index + 1}`} onPress={() => onChange(photos.filter((_, i) => i !== index))} style={s.removePhoto}><Text style={s.removePhotoText}>×</Text></Pressable></View>)}<Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()}`} onPress={pick} style={s.upload}><Text style={s.uploadIcon}>＋</Text><Text style={s.uploadText}>{single && photos.length ? 'Replace photo' : 'Add photos'}</Text></Pressable></View>{!!error && <Text accessibilityRole="alert" style={s.errorText}>{error}</Text>}</View>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={s.card}><Text style={s.cardTitle}>{title}</Text>{children}</View>;
}

export default function AddProductScreen() {
  const allowed = isAuthenticated() && getAuthenticatedRoleId() === 1;
  const [form, setForm] = useState<NewProduct>(blankProduct);
  const [options, setOptions] = useState<ProductFormOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const savingRef = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const loadOptions = useCallback(async () => {
    if (!allowed) return;
    setLoading(true); setLoadError('');
    try { setOptions(await getNewProductOptions()); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'Product options could not be loaded.'); }
    finally { setLoading(false); }
  }, [allowed]);
  useEffect(() => { void loadOptions(); }, [loadOptions]);
  const update = <K extends keyof NewProduct>(key: K, value: NewProduct[K]) => { setDirty(true); setForm((current) => ({ ...current, [key]: value })); };
  const attribute = <K extends keyof NewProductAttribute>(index: number, key: K, value: NewProductAttribute[K]) => update('attributes', form.attributes.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const leave = () => { if (dirty) setDiscardOpen(true); else router.replace('/products'); };
  const submit = async () => {
    if (!options || savingRef.current) return;
    savingRef.current = true; setSaving(true); setSaveError('');
    try { await createProduct(form, options); setDirty(false); setCreated(true); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Please try again.'); scroll.current?.scrollTo({ y: 0, animated: true }); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const showProducts = () => {
    setProductListFilters({ productName: form.product_name.trim(), categoryId: null }); setProductListScrollOffset(0);
    router.replace({ pathname: '/products', params: { productName: form.product_name.trim(), categoryId: '', refresh: String(Date.now()) } });
  };
  if (!allowed) return <Redirect href={isAuthenticated() ? '/dashboard' : '/'} />;
  if (created) return <SafeAreaView style={s.safe}><View style={s.success}><View style={s.successIcon}><Text style={s.successCheck}>✓</Text></View><Text style={s.successTitle}>Product added</Text><Text style={s.successCopy}>{form.product_name.trim()} is now in your catalogue.</Text><Text style={s.hint}>{form.status === '1' ? 'This product is active.' : 'This product is inactive until you’re ready to make it available.'}</Text><Pressable onPress={showProducts} style={s.primary}><Text style={s.primaryText}>View product</Text></Pressable><Pressable onPress={() => { setForm(blankProduct()); setCreated(false); setSaveError(''); }} style={s.secondary}><Text style={s.secondaryText}>Add another product</Text></Pressable></View></SafeAreaView>;
  return <SafeAreaView style={s.safe}><View style={s.header}><Pressable disabled={saving} accessibilityRole="button" accessibilityLabel="Back to products" onPress={leave} style={s.back}><Text style={s.backText}>‹</Text></Pressable><View style={s.flex}><Text style={s.headerTitle}>Add product</Text></View><View style={s.adminPill}><Text style={s.adminText}>ADMIN</Text></View></View>
    {loading ? <View style={s.center}><ActivityIndicator color="#176B45" size="large" /><Text style={s.hint}>Preparing your product form…</Text></View> : loadError ? <View style={s.center}><Text style={s.sectionTitle}>Couldn’t load the form</Text><Text accessibilityRole="alert" style={s.successCopy}>{loadError}</Text><Pressable onPress={loadOptions} style={s.primary}><Text style={s.primaryText}>Try again</Text></Pressable>{/session|access was denied/i.test(loadError) && <Pressable onPress={() => router.push('/reconnect-products')} style={s.secondary}><Text style={s.secondaryText}>Reconnect products</Text></Pressable>}</View> : options && <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView ref={scroll} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets><View pointerEvents={saving ? 'none' : 'auto'}>

      {!!saveError && <View style={s.errorBox}><Text accessibilityRole="alert" style={s.errorText}>{saveError}</Text>{/session/i.test(saveError) && <Pressable onPress={loadOptions}><Text style={s.link}>Check product session</Text></Pressable>}</View>}
      <View style={s.formToolbar}><Text style={s.required}>* Required</Text><Pressable accessibilityRole="button" accessibilityState={{ expanded: showMore }} onPress={() => setShowMore((value) => !value)}><Text style={s.moreOptions}>{showMore ? 'Fewer options −' : 'More options +'}</Text></Pressable></View>
      <Section title="Product details">
        <Field label="Product name *" value={form.product_name} onChange={(v) => update('product_name', v)} placeholder="Enter product name" />
        <Choice label="Category *" value={form.category_id} options={options.categories} onChange={(v) => update('category_id', v)} placeholder="Choose a category" />
        {showMore && <><View style={s.row}><View style={s.flex}><Field label="Brand name" value={form.brand_name} onChange={(v) => update('brand_name', v)} placeholder="Brand" /></View><View style={s.flex}><Field label="Item code" value={form.item_code} onChange={(v) => update('item_code', v)} placeholder="e.g. RICE-001" /></View></View>
        <Field label="Description" value={form.product_desc} onChange={(v) => update('product_desc', v)} placeholder="Product description" multiline /></>}
        <Photos label="Product photos" photos={form.images} onChange={(v) => update('images', v)} />
      </Section>
      <Section title="Pack sizes">
        {form.attributes.map((item, index) => <View key={index} style={s.variant}><View style={s.variantHeading}><Text style={s.variantTitle}>Variant {String(index + 1).padStart(2, '0')}</Text>{form.attributes.length > 1 && <Pressable accessibilityLabel={`Remove variant ${index + 1}`} onPress={() => update('attributes', form.attributes.filter((_, i) => i !== index))}><Text style={s.remove}>Remove</Text></Pressable>}</View><Field label="Variant name *" value={item.name} onChange={(v) => attribute(index, 'name', v)} placeholder="Enter pack name" /><View style={s.row}><View style={s.flex}><Field label="Quantity *" value={item.quantity} onChange={(v) => attribute(index, 'quantity', v)} numeric placeholder="Enter quantity" /></View><View style={s.flex}><Choice label="Unit *" value={item.unit} placeholder="Select unit" options={PRODUCT_UNITS} onChange={(v) => attribute(index, 'unit', v)} /></View></View>{showMore && <><View style={s.row}><View style={s.flex}><Choice label="Commission type" value={item.commission_type} options={DISCOUNTS.slice(1)} onChange={(v) => attribute(index, 'commission_type', v)} /></View><View style={s.flex}><Field label="Commission value" value={item.commission_value} onChange={(v) => attribute(index, 'commission_value', v)} numeric /></View></View><View style={s.row}><View style={s.flex}><Choice label="Variant discount" value={item.discount_type} options={DISCOUNTS} onChange={(v) => update('attributes', form.attributes.map((a, i) => i === index ? { ...a, discount_type: v, discount_value: v ? a.discount_value : '' } : a))} /></View>{!!item.discount_type && <View style={s.flex}><Field label="Discount value" value={item.discount_value} onChange={(v) => attribute(index, 'discount_value', v)} numeric placeholder={item.discount_type === 'percent' ? '0–100' : '0.00'} /></View>}</View><Photos label={`Variant ${index + 1} photos`} photos={item.images} onChange={(v) => attribute(index, 'images', v)} /></>}</View>)}
        <Pressable accessibilityRole="button" onPress={() => update('attributes', [...form.attributes, blankAttribute()])} style={s.addRow}><Text style={s.addRowText}>＋ Add variant</Text></Pressable>
      </Section>
      {showMore && <><Section title="Offers & tax">
        <Choice label="Promotion" value={form.promotion_id} options={[{ value: '', label: 'No promotion' }, ...options.promotions]} onChange={(v) => update('promotion_id', v)} />
        <Choice label="Tax" value={form.tax_id} options={[{ value: '', label: 'No tax' }, ...options.taxes]} onChange={(v) => update('tax_id', v)} />
        <View style={s.row}><View style={s.flex}><Choice label="Product discount" value={form.product_discount_type} options={DISCOUNTS} onChange={(v) => { setDirty(true); setForm((f) => ({ ...f, product_discount_type: v, product_discount_value: v ? f.product_discount_value : '' })); }} /></View>{!!form.product_discount_type && <View style={s.flex}><Field label="Product discount value" value={form.product_discount_value} onChange={(v) => update('product_discount_value', v)} numeric placeholder={form.product_discount_type === 'percent' ? '0–100' : '0.00'} /></View>}</View>
      </Section>
      <Section title="Extra details">
        <Field label="Nutrition" value={form.nutrition} onChange={(v) => update('nutrition', v)} placeholder="Ingredients, nutrition facts or dietary information" multiline />
        <Photos label="Nutrition image" single photos={form.nutritionImage ? [form.nutritionImage] : []} onChange={(v) => update('nutritionImage', v[0] || null)} />
        {form.customFields.map((field, index) => <View key={index} style={s.variant}><View style={s.variantHeading}><Text style={s.variantTitle}>Custom field {index + 1}</Text><Pressable onPress={() => update('customFields', form.customFields.filter((_, i) => i !== index))}><Text style={s.remove}>Remove</Text></Pressable></View><Field label={`Custom field ${index + 1} title`} value={field.title} placeholder="e.g. Storage instructions" onChange={(v) => update('customFields', form.customFields.map((f, i) => i === index ? { ...f, title: v } : f))} /><Field label={`Custom field ${index + 1} description`} value={field.description} multiline onChange={(v) => update('customFields', form.customFields.map((f, i) => i === index ? { ...f, description: v } : f))} /></View>)}
        <Pressable accessibilityRole="button" onPress={() => update('customFields', [...form.customFields, { title: '', description: '' }])} style={s.addRow}><Text style={s.addRowText}>＋ Add custom field</Text></Pressable>
      </Section>
      </>}
      <Section title="Status">
        {showMore && ([['hotdeals', 'Hot deals', 'Feature this product as a great deal.'], ['offers', 'New offers', 'Include it in your latest offers.'], ['new_arrival', 'New arrival', 'Highlight a fresh addition.']] as const).map(([key, label, caption]) => <View key={key} style={s.toggle}><View style={s.flex}><Text style={s.toggleTitle}>{label}</Text><Text style={s.caption}>{caption}</Text></View><Switch accessibilityLabel={label} value={form[key]} onValueChange={(v) => update(key, v)} trackColor={{ false: '#DCE5DF', true: '#176B45' }} thumbColor="#FFFFFF" /></View>)}
        <View style={s.statusRow}>{[{ value: '1', label: 'Active', caption: 'Available to customers' }, { value: '0', label: 'Inactive', caption: 'Keep it unavailable' }].map((status) => <Pressable key={status.value} accessibilityRole="radio" accessibilityState={{ checked: form.status === status.value }} onPress={() => update('status', status.value)} style={[s.status, form.status === status.value && s.statusSelected]}><Text style={[s.statusTitle, form.status === status.value && s.statusTitleSelected]}>{form.status === status.value ? '● ' : '○ '}{status.label}</Text><Text style={s.statusCaption}>{status.caption}</Text></Pressable>)}</View>
      </Section>
    </View></ScrollView><View style={s.footer}><Pressable disabled={saving} onPress={leave} style={s.cancel}><Text style={s.secondaryText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={saving} onPress={submit} style={[s.primary, s.save, saving && s.disabled]}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryText}>＋  Add product</Text>}</Pressable></View></KeyboardAvoidingView>}
    <Modal visible={discardOpen} transparent animationType="fade" onRequestClose={() => setDiscardOpen(false)}><View style={s.overlay}><View style={[s.modal, s.discard]}><Text style={s.sectionTitle}>Discard this product?</Text><Text style={s.successCopy}>Your unsaved details and selected photos will be lost.</Text><Pressable onPress={() => setDiscardOpen(false)} style={s.primary}><Text style={s.primaryText}>Keep editing</Text></Pressable><Pressable onPress={() => { setDiscardOpen(false); router.replace('/products'); }} style={s.secondary}><Text style={s.remove}>Discard changes</Text></Pressable></View></View></Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F8F4' }, flex: { flex: 1, minWidth: 0 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E4ECE5' }, back: { height: 42, width: 42, borderRadius: 14, backgroundColor: '#F0F5F1', alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 32, color: '#173D2D', lineHeight: 35 }, headerTitle: { fontSize: 21, fontWeight: '800', color: '#173D2D' }, adminPill: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#EAF4EC', borderRadius: 20 }, adminText: { color: '#176B45', fontSize: 10, letterSpacing: 1, fontWeight: '800' },
  page: { width: '100%', maxWidth: 780, alignSelf: 'center', padding: 18, paddingBottom: 28 }, required: { fontSize: 11, color: '#829185' }, formToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingHorizontal: 4 }, moreOptions: { color: '#176B45', fontSize: 12, fontWeight: '700', paddingVertical: 6 }, cardTitle: { color: '#173D2D', fontSize: 16, fontWeight: '800', marginBottom: 16 },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E3EBE4' }, sectionTitle: { color: '#173D2D', fontSize: 17, fontWeight: '800' }, caption: { color: '#809084', fontSize: 11, lineHeight: 17, marginTop: 3 }, field: { marginBottom: 12 }, label: { color: '#365343', fontSize: 12, fontWeight: '700', marginBottom: 8 }, input: { minHeight: 48, borderWidth: 1, borderColor: '#DEE8E0', backgroundColor: '#FAFCFA', borderRadius: 12, paddingHorizontal: 13, fontSize: 14, color: '#244536', paddingVertical: 12 }, textarea: { minHeight: 100, textAlignVertical: 'top', lineHeight: 21 }, row: { flexDirection: 'row', gap: 12 }, select: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#DEE8E0', backgroundColor: '#FAFCFA', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 }, selectText: { flex: 1, color: '#244536', fontSize: 13 }, placeholder: { color: '#92A096' }, chevron: { color: '#6F8776', fontSize: 17 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, photoWrap: { width: 90, height: 90 }, photo: { width: '100%', height: '100%', borderRadius: 14 }, removePhoto: { position: 'absolute', right: 4, top: 4, width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' }, removePhotoText: { color: '#993D35', fontSize: 20 }, upload: { minWidth: 105, height: 90, borderWidth: 1, borderStyle: 'dashed', borderColor: '#B6CEBC', borderRadius: 14, padding: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5FAF3' }, uploadIcon: { fontSize: 25, color: '#5C805B' }, uploadText: { color: '#5C805B', fontSize: 11, fontWeight: '700', marginTop: 4 }, variant: { backgroundColor: '#F8FBF7', borderWidth: 1, borderColor: '#E3ECE0', borderRadius: 16, padding: 14, marginBottom: 14 }, variantHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, variantTitle: { color: '#4C6E4F', fontSize: 12, fontWeight: '800' }, remove: { color: '#AD5146', fontSize: 12, fontWeight: '700' }, addRow: { padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#CAE0CF', borderRadius: 12, backgroundColor: '#F1F8EF' }, addRowText: { fontSize: 13, color: '#326942', fontWeight: '700' },
  toggle: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#EEF3EE' }, toggleTitle: { fontSize: 13, color: '#365343', fontWeight: '700' }, statusRow: { flexDirection: 'row', gap: 10 }, status: { flex: 1, borderWidth: 1, borderColor: '#DFE7E0', borderRadius: 12, padding: 12 }, statusSelected: { borderColor: '#6D9D73', backgroundColor: '#EFF7EB' }, statusTitle: { color: '#75897A', fontSize: 13, fontWeight: '700' }, statusTitleSelected: { color: '#376340' }, statusCaption: { color: '#829185', fontSize: 10, lineHeight: 16, marginTop: 5 }, footer: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 22, paddingVertical: 14, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E3EBE4' }, primary: { backgroundColor: '#176B45', borderRadius: 14, minHeight: 49, paddingHorizontal: 24, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFF', fontSize: 14, fontWeight: '800' }, save: { flex: 1 }, cancel: { paddingVertical: 15, paddingHorizontal: 12 }, secondary: { alignItems: 'center', padding: 17 }, secondaryText: { color: '#6B8172', fontSize: 13, fontWeight: '700' }, disabled: { opacity: 0.6 },
  center: { flex: 1, padding: 30, alignItems: 'center', justifyContent: 'center' }, hint: { color: '#7B8E80', fontSize: 12, lineHeight: 19, marginVertical: 14, textAlign: 'center' }, overlay: { flex: 1, backgroundColor: 'rgba(17,40,28,.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }, modal: { backgroundColor: '#FFF', width: '100%', maxWidth: 460, maxHeight: '75%', borderRadius: 22, overflow: 'hidden' }, modalHeading: { padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, close: { padding: 6 }, closeText: { color: '#698270', fontSize: 23 }, search: { margin: 12, marginTop: 0 }, option: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: '#EFF3EE' }, optionSelected: { backgroundColor: '#EFF7EB' }, optionText: { flex: 1, color: '#365343', fontSize: 13 }, optionCheck: { color: '#176B45', fontWeight: '800' }, errorBox: { backgroundColor: '#FFF0EC', borderRadius: 14, padding: 16, marginBottom: 16 }, errorText: { color: '#A14235', lineHeight: 20, fontSize: 13 }, link: { color: '#176B45', fontWeight: '700', marginTop: 12 }, success: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', padding: 30, justifyContent: 'center', alignItems: 'center' }, successIcon: { width: 84, height: 84, borderRadius: 28, backgroundColor: '#E0EFD7', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }, successCheck: { color: '#176B45', fontSize: 38 }, successTitle: { fontSize: 28, fontWeight: '800', color: '#173D2D' }, successCopy: { color: '#728778', lineHeight: 22, fontSize: 14, textAlign: 'center', marginVertical: 14 }, discard: { padding: 24 },
});
