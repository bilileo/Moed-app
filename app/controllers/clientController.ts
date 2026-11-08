"use server";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// 1. Inicialización para el cliente (Usa ANON_KEY, seguro para lecturas públicas)
const createClient = async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
      },
    }
  );
};

// 2. Obtener Menú y Configuración
export async function getClientMenuData() {
  const supabase = await createClient();
  const [menuRes, configRes] = await Promise.all([
    supabase.from('menu_items').select('*').order('id', { ascending: true }),
    supabase.from('store_config').select('*').eq('key', 'is_open').single()
  ]);

  // SOLUCIÓN AL BUG: Convertimos explícitamente el texto 'false' a booleano false
  let isOpen = true;
  if (configRes.data) {
    isOpen = configRes.data.value === true || configRes.data.value === 'true';
  }

  return {
    menuItems: menuRes.data || [],
    isOpen: isOpen
  };
}

// 3. Enviar Pedido a la Base de Datos
export async function submitOrderAction(orderData: any) {
  const supabase = await createClient();
  const { error } = await supabase.from('orders').insert([orderData]);
  
  if (error) {
    console.error("Error al guardar el pedido:", error.message);
    throw new Error("No se pudo procesar el pedido.");
  }
  return true;
}