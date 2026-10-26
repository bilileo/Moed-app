"use client";
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { ChevronLeft, ChevronRight, ShoppingCart, X, Plus, Minus, Trash2, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { supabase } from './lib/supabase';

// --- INTERFACES ---
interface MenuVariant {
  name: string;
  description: string;
  price: string;
  image?: string; 
}

interface MenuItem {
  id: number;
  name: string;
  image: string;
  description?: string;
  price?: string;
  variants?: MenuVariant[];
}

interface CartItem {
  cartId: string;
  id: number;
  name: string;
  variantName: string | null;
  price: number;
  quantity: number;
  image: string;
}

// --- COMPONENTE MENU CARD ---
const MenuCard = ({ item, onAddToCart }: { item: MenuItem, onAddToCart: (item: MenuItem, variantIdx: number) => void }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const hasVariants = item.variants && item.variants.length > 0;
  
  const currentPriceStr = hasVariants ? item.variants![activeIdx].price : item.price;
  const currentDesc = hasVariants ? item.variants![activeIdx].description : item.description;
  const currentVariantName = hasVariants ? item.variants![activeIdx].name : null;
  const currentImage = hasVariants && item.variants![activeIdx].image ? item.variants![activeIdx].image : item.image;

  const nextVariant = (e: React.MouseEvent) => {
    e.preventDefault();
    if (hasVariants) setActiveIdx((prev) => (prev + 1) % item.variants!.length);
  };

  const prevVariant = (e: React.MouseEvent) => {
    e.preventDefault();
    if (hasVariants) setActiveIdx((prev) => (prev === 0 ? item.variants!.length - 1 : prev - 1));
  };

  return (
    <div className="w-[75vw] max-w-[280px] md:max-w-[300px] snap-start shrink-0 group flex flex-col bg-white p-4 rounded-3xl shadow-sm border border-gray-100 mx-auto">
      <div className="aspect-[4/5] bg-[#FDFBF7] rounded-2xl mb-4 overflow-hidden relative shadow-inner">
        <Image 
          key={currentImage} src={currentImage!} alt={item.name} fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 768px) 280px, 300px"
        />
      </div>

      <h3 className="text-lg md:text-xl font-bold mb-2 text-center md:text-left">{item.name}</h3>

      {hasVariants && (
        <div className="flex items-center justify-between bg-gray-100/80 rounded-full px-2 py-1 mb-3">
          <button onClick={prevVariant} className="p-1 hover:bg-white rounded-full transition-colors"><ChevronLeft size={16} /></button>
          <span className="text-sm font-semibold text-gray-800 flex-1 text-center truncate px-2">{currentVariantName}</span>
          <button onClick={nextVariant} className="p-1 hover:bg-white rounded-full transition-colors"><ChevronRight size={16} /></button>
        </div>
      )}

      <p className="text-gray-600 text-sm leading-relaxed min-h-[70px] flex-grow text-center md:text-left">
        {currentDesc}
      </p>

      {hasVariants && item.variants!.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2 mb-4">
          {item.variants!.map((_, idx) => (
            <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === activeIdx ? 'bg-black' : 'bg-gray-300'}`} />
          ))}
        </div>
      )}

      <button 
        onClick={() => onAddToCart(item, activeIdx)}
        className="w-full mt-auto bg-[#1A1A1A] text-white py-3 rounded-full font-medium hover:bg-black transition-transform hover:scale-[1.02] active:scale-95 shadow-md flex justify-between items-center px-6"
      >
        <span>Agregar</span>
        <span className="font-bold">{currentPriceStr}</span>
      </button>
    </div>
  );
};


// --- COMPONENTE PRINCIPAL ---
export default function MenuApp() {
  const [menuCategory, setMenuCategory] = useState<'comida' | 'bebidas'>('comida');
  
  // Estado del Carrito
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  
  // Estado para el Checkout y Anti-Spam
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [botHoneypot, setBotHoneypot] = useState(""); // Campo trampa
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const menuSnacks: MenuItem[] = [
    { id: 4, name: "Croissant", image: "/i3.jpg", variants: [ { name: "Relleno Clásico", description: "Paleta de hielo (vainilla), crema, Nutella, 1 topping.", price: "$85 MXN", image: "/i3.jpg" }, { name: "Relleno Especial", description: "Rajas de chile poblano, Jamón, Queso y Lechuga.", price: "$85 MXN", image: "/i8.jpg" } ] },
    { id: 5, name: "Pan de Muerto", image: "/pan_muerto.jpg", variants: [ { name: "Relleno Clásico", description: "Fresas, crema, 1 topping (almendras).", price: "$85 MXN", image: "/pan_muerto.jpg" }, { name: "Relleno Nutella", description: "Fresas, crema, Nutella, 2 toppings.", price: "$95 MXN", image: "/pan_muerto.jpg" } ] },
    { id: 6, name: "Mini Pancakes", image: "/i2.jpg", variants: [ { name: "Clásicos", description: "12 pz, Fresas, Plátano, crema, 1 topping, 1 jalea.", price: "$85 MXN", image: "/i7.jpg" }, { name: "Nutella", description: "12 pz, Fresas, crema, Nutella, 3 topping.", price: "$90 MXN", image: "/i1.jpg" }, { name: "Nutella Banana", description: "12 pz, plátano, crema, Nutella, 3 topping.", price: "$90 MXN", image: "/i1.jpg" }, { name: "Mini King", description: "15 pz, Fresas, Plátano, Durazno, crema, 3 topping, 2 jalea.", price: "$100 MXN", image: "/i1.jpg" } ] }
  ];

  const menuBebidas: MenuItem[] = [
    { id: 7, name: "Matcha Protein", description: "Matcha orgánico preparado con leche, 26gr de proteína y cold foam.", price: "$80 MXN", image: "/b3.jpg" },
    { id: 8, name: "Tropical MOED", description: "Smoothie de mango con plátano y Dragon Fruit, endulzado con miel de agave.", price: "$75 MXN", image: "/b2.jpg" },
    { id: 9, name: "Fit Detox", description: "Jugo verde con apio, piña, naranja, nopal y espinaca, endulzado con miel de agave.", price: "$75 MXN", image: "/b1.jpg" },
    { id: 10, name: "Red Power", description: "Pruebalo y siente el poder fluir por tus venas. Anímate a probarlo...", price: "$75 MXN", image: "/b4.jpg" }
  ];

  const activeMenu = menuCategory === 'comida' ? menuSnacks : menuBebidas;

  // --- LOGICA DE CARRITO ---
  const handleAddToCart = (item: MenuItem, variantIdx: number) => {
    const hasVariants = item.variants && item.variants.length > 0;
    const variantName = hasVariants ? item.variants![variantIdx].name : null;
    const priceStr = hasVariants ? item.variants![variantIdx].price : item.price;
    const numericPrice = parseFloat(priceStr!.replace(/[^0-9.-]+/g, ""));
    const image = hasVariants && item.variants![variantIdx].image ? item.variants![variantIdx].image : item.image;
    const cartId = `${item.id}-${variantName || 'default'}`;

    setCart(prev => {
      const existing = prev.find(i => i.cartId === cartId);
      if (existing) {
        return prev.map(i => i.cartId === cartId ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { cartId, id: item.id, name: item.name, variantName, price: numericPrice, quantity: 1, image: image! }];
    });
    
    setIsMobileCartOpen(true);
  };

  const updateQuantity = (cartId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        return { ...item, quantity: Math.max(1, item.quantity + delta) };
      }
      return item;
    }));
  };

  const removeFromCart = (cartId: string) => setCart(prev => prev.filter(item => item.cartId !== cartId));

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // --- ENVÍO A SUPABASE + ANTI-SPAM ---
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (cart.length === 0 || cartTotal === 0) return;
    if (customerPhone.length < 10) {
      setErrorMessage("Por favor ingresa un número de WhatsApp válido.");
      return;
    }

    if (botHoneypot !== "") {
      setOrderSuccess(true);
      return;
    }

    const lastOrderTime = localStorage.getItem('moed_last_order');
    if (lastOrderTime) {
      const timePassed = Date.now() - parseInt(lastOrderTime);
      const cooldownMs = 0.5 * 60 * 1000; 
      if (timePassed < cooldownMs) {
        setErrorMessage(`Por favor espera unos minutos antes de hacer otro pedido.`);
        return;
      }
    }

    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('orders')
        .insert([{
          customer_name: customerName,
          customer_phone: customerPhone,
          items: cart,
          total: cartTotal,
          status: 'Pendiente'
        }]);

      if (error) throw error;

      localStorage.setItem('moed_last_order', Date.now().toString());
      setOrderSuccess(true);
      setCart([]);
      
      setTimeout(() => {
        setOrderSuccess(false);
        setIsMobileCartOpen(false);
        setCustomerName("");
        setCustomerPhone("");
      }, 4000);

    } catch (error) {
      console.error("Error al guardar el pedido:", error);
      setErrorMessage("Ocurrió un error al enviar tu pedido. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- INTERFAZ DEL CARRITO (Función render en lugar de Componente para no perder el foco) ---
  const renderCartContent = () => (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ShoppingCart size={24}/> Tu Pedido
        </h2>
        <button onClick={() => setIsMobileCartOpen(false)} className="lg:hidden p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button>
      </div>

      {orderSuccess ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h3 className="text-2xl font-bold mb-2">¡Pedido Recibido!</h3>
          <p className="text-gray-500">Estamos preparando tus antojos. Te avisaremos al {customerPhone} cuando esté listo.</p>
        </div>
      ) : cart.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
          <ShoppingCart size={48} className="mb-4 opacity-20" />
          <p>Tu carrito está vacío</p>
          <p className="text-sm mt-2">Agrega unos deliciosos snacks para comenzar.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {cart.map(item => (
              <div key={item.cartId} className="flex gap-4 items-center">
                <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm truncate">{item.name}</h4>
                  {item.variantName && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.variantName}</p>}
                  <div className="font-bold text-sm mt-1">${item.price}</div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button onClick={() => removeFromCart(item.cartId)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>
                  <div className="flex items-center gap-3 bg-gray-100 rounded-full px-2 py-1">
                    <button onClick={() => updateQuantity(item.cartId, -1)} className="p-1 hover:bg-white rounded-full"><Minus size={12}/></button>
                    <span className="text-xs font-bold w-3 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.cartId, 1)} className="p-1 hover:bg-white rounded-full"><Plus size={12}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t p-6 bg-gray-50 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center mb-6">
              <span className="text-gray-600">Total a pagar</span>
              <span className="text-2xl font-black">${cartTotal} MXN</span>
            </div>
            
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
            
            <form onSubmit={handleCheckout} className="space-y-3">
              <input type="text" name="address_confirm" value={botHoneypot} onChange={e => setBotHoneypot(e.target.value)} style={{ display: 'none' }} tabIndex={-1} autoComplete="off"/>
              <input required type="text" placeholder="Tu Nombre" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white"/>
              <input required type="tel" placeholder="Tu WhatsApp (10 dígitos)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm bg-white"/>
              <button type="submit" disabled={isSubmitting} className="w-full bg-[#1A1A1A] text-white py-4 rounded-xl font-bold hover:bg-black transition-colors disabled:bg-gray-400 flex justify-center items-center gap-2 mt-4">
                {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : 'Confirmar Pedido'}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1A1A1A] font-sans selection:bg-[#1A1A1A] selection:text-[#FDFBF7] flex">
      <Head><title>MOED | Menú</title></Head>

      <div className="flex-1 lg:pr-[380px] w-full">
        <nav className="sticky top-0 z-40 bg-[#FDFBF7]/95 backdrop-blur-md border-b border-gray-200">
          <div className="flex justify-between items-center py-4 px-6 max-w-5xl mx-auto">
            <div className="text-2xl font-serif font-black tracking-tighter">
              MOED<span className="text-xs font-sans font-light ml-1 uppercase text-gray-500">Menú</span>
            </div>
            <button onClick={() => setIsMobileCartOpen(true)} className="lg:hidden relative p-2.5 bg-white border border-gray-200 rounded-full shadow-sm">
              <ShoppingCart size={20} />
              {cartItemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[#1A1A1A] text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full animate-bounce">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </nav>

        <main className="max-w-5xl mx-auto pt-8 pb-24">
          <div className="flex justify-center mb-8 px-6">
            <div className="bg-gray-100 p-1.5 rounded-full flex gap-1 shadow-inner border border-gray-200 w-full max-w-[300px]">
              <button onClick={() => setMenuCategory('comida')} className={`flex-1 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${menuCategory === 'comida' ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-black'}`}>🥐 Comida</button>
              <button onClick={() => setMenuCategory('bebidas')} className={`flex-1 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${menuCategory === 'bebidas' ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-black'}`}>🧋 Bebidas</button>
            </div>
          </div>

          <div className="flex flex-wrap justify-center md:grid md:grid-cols-2 xl:grid-cols-3 gap-6 px-6 pb-8 overflow-x-hidden">
            {activeMenu.map((item) => (
              <MenuCard key={`${menuCategory}-${item.id}`} item={item} onAddToCart={handleAddToCart} />
            ))}
          </div>
        </main>
      </div>

      <aside className="hidden lg:block w-[380px] fixed right-0 top-0 bottom-0 bg-white border-l border-gray-200 z-50 shadow-2xl">
        {renderCartContent()}
      </aside>

      {isMobileCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setIsMobileCartOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl animate-slide-in-right">
            {renderCartContent()}
          </div>
        </div>
      )}
    </div>
  );
}