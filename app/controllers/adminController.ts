"use server";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// 1. Inicialización segura (ASÍNCRONA para Next.js 15+)
const createClient = async () => {
  const cookieStore = await cookies(); // ¡El await es la clave aquí!
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: any) {
          // En Server Actions podemos setear cookies si es necesario
          try { cookieStore.set({ name, value, ...options }); } catch (error) {}
        },
        remove(name: string, options: any) {
          try { cookieStore.set({ name, value: '', ...options }); } catch (error) {}
        },
      },
    }
  );
};

// 2. Obtener datos iniciales
export async function getDashboardData() {
  const supabase = await createClient();
  const [ordersRes, menuRes, configRes] = await Promise.all([
    supabase.from('orders').select('*').neq('status', 'Completado').order('created_at', { ascending: true }),
    supabase.from('menu_items').select('*').order('id', { ascending: true }),
    supabase.from('store_config').select('*').eq('key', 'is_open').single()
  ]);
  
  return {
    orders: ordersRes.data || [],
    menuProducts: menuRes.data || [],
    // Evaluamos estrictamente si el texto es 'true'
    isOpen: configRes.data?.value === 'true' 
  };
}

export async function fetchMenuOnly() {
  const supabase = await createClient();
  const { data } = await supabase.from('menu_items').select('*').order('id', { ascending: true });
  return data || [];
}

export async function fetchOrdersOnly() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('orders')
    .select('*')
    .neq('status', 'Completado')
    .order('created_at', { ascending: true });
  return data || [];
}

// 3. Lógica de Pedidos (Órdenes)
export async function updateOrderStatusAction(orderId: string, newStatus: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
  if (error) throw new Error(error.message);
  return true;
}

export async function deleteOrderAction(orderId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('orders').delete().eq('id', orderId);
  if (error) throw new Error(error.message);
  return true;
}

// 4. Lógica del Menú
export async function toggleSoldOutAction(productId: number, currentStatus: boolean) {
  const supabase = await createClient();
  const newStatus = !currentStatus;
  const { error } = await supabase.from('menu_items').update({ is_sold_out: newStatus }).eq('id', productId);
  if (error) throw new Error(error.message);
  return newStatus;
}

export async function deleteProductAction(productId: number) {
  const supabase = await createClient();
  const { error } = await supabase.from('menu_items').delete().eq('id', productId);
  if (error) throw new Error(error.message);
  return true;
}

export async function saveProductAction(productData: any, editingId: number | null) {
  const supabase = await createClient();
  if (editingId) {
    const { error } = await supabase.from('menu_items').update(productData).eq('id', editingId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('menu_items').insert([{ id: Date.now(), ...productData, is_sold_out: false }]);
    if (error) throw new Error(error.message);
  }
  return true;
}


export async function toggleStoreOpenAction(currentStatus: boolean) {
  const supabase = await createClient();
  const newStatus = !currentStatus;
  
  // Guardamos estrictamente el texto 'true' o 'false'
  const { error } = await supabase
    .from('store_config')
    .update({ value: newStatus ? 'true' : 'false' })
    .eq('key', 'is_open');

  if (error) {
    console.error("Error al actualizar:", error.message);
    throw new Error("Fallo en la base de datos");
  }
  
  return newStatus;
}

// 5. Subida de Imágenes Oculta
export async function uploadImageAction(formData: FormData) {
  const supabase = await createClient();
  const file = formData.get('file') as File;
  if (!file) throw new Error("No se proporcionó ningún archivo");

  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage.from('menu-images').upload(fileName, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = supabase.storage.from('menu-images').getPublicUrl(fileName);
  return publicUrlData.publicUrl;
}