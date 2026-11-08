"use client";
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import { CheckCircle, Bell } from 'lucide-react';
import Image from 'next/image';

interface Order {
  id: string;
  customer_name: string;
  status: string;
}

export default function PublicDisplay() {
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);

  useEffect(() => {
    const fetchReadyOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, customer_name, status')
        .eq('status', 'Listo');
      if (data) setReadyOrders(data);
    };

    fetchReadyOrders();

    const channel = supabase
      .channel('public-display-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: any) => {
        fetchReadyOrders(); // Refrescar lista al haber cambios
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white font-sans flex flex-col p-8 md:p-12">
      <Head><title>MOED | Pantalla de Llamados</title></Head>

      {/* HEADER */}
      <header className="flex justify-between items-center border-b border-white/10 pb-6 mb-10">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center overflow-hidden border-2 border-white">
            <Image src="/logo.jpg" alt="Logo" width={56} height={56} className="object-cover" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-black tracking-tight">MOED</h1>
            <p className="text-gray-400 text-sm">Pantalla de Llamados y Recolección</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-5 py-2.5 rounded-full font-bold text-sm border border-emerald-500/30 animate-pulse">
          <Bell size={18} /> Sistema en Vivo
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col justify-center">
        <h2 className="text-center text-4xl font-serif font-bold mb-10 text-gray-200 tracking-wide uppercase">
          ¡Pedidos Listos para Recoger!
        </h2>

        {readyOrders.length === 0 ? (
          <div className="text-center py-20 text-gray-500 text-2xl font-light">
            Esperando nuevos pedidos listos...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto w-full">
            {readyOrders.map(order => (
              <div 
                key={order.id} 
                className="bg-emerald-600 text-white rounded-3xl p-8 shadow-2xl flex flex-col items-center justify-center text-center transform scale-100 hover:scale-105 transition-transform animate-bounce-short border-4 border-emerald-400"
              >
                <CheckCircle size={48} className="mb-4 text-emerald-200" />
                <span className="text-sm font-bold uppercase tracking-widest text-emerald-200 mb-1">Pase por su pedido</span>
                <h3 className="text-4xl md:text-5xl font-black tracking-tight">{order.customer_name}</h3>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="text-center text-gray-500 text-sm pt-8 border-t border-white/10 mt-auto">
        Gracias por su preferencia • MOED Snack Bar
      </footer>
    </div>
  );
}