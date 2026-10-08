import React, { useEffect, useState } from 'react';

/** Onde o chamado deixa a tela a abrir: no sessionStorage da aba nova (não vai no endereço) */
export const CHAVE_TELA_REMOTA = 'crmweb_tela_remota';

interface Pedido {
  url: string;
  titulo: string;
}

const lerPedido = (): Pedido | null => {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_TELA_REMOTA) || 'null');
  } catch {
    return null;
  }
};

/**
 * Página /tela-remota: a aba que o "Acessar computador" abre. O título da aba é o do cliente e do
 * computador (a página do MeshCentral teria o título dela) e a tela remota ocupa a aba toda, num
 * iframe liberado para crm.bmsoft.com.br no config do MeshCentral. O F5 mantém a tela (o pedido
 * fica no sessionStorage desta aba).
 */
export const TelaRemota: React.FC = () => {
  const [pedido] = useState(lerPedido);
  // O MeshCentral só deixa ser embutido neste endereço (allowedFramingOrigins no config dele; o
  // instalador do BMDesk grava). Em qualquer outro (localhost, *.vercel.app) abre ele direto, sem iframe
  const embutir = window.location.origin === 'https://crm.bmsoft.com.br';

  useEffect(() => {
    if (!pedido) return;
    document.title = pedido.titulo;
    if (!embutir) window.location.replace(pedido.url);
  }, [pedido, embutir]);

  if (!pedido) {
    return (
      <div className="h-screen flex items-center justify-center p-6 text-sm text-stone-500">
        Abra a tela remota pelo botão "Acessar computador" do chamado.
      </div>
    );
  }
  if (!embutir) return null;
  return (
    <iframe
      src={pedido.url}
      title={pedido.titulo}
      allow="clipboard-read; clipboard-write; fullscreen"
      className="fixed inset-0 w-full h-full border-0 bg-black"
    />
  );
};
