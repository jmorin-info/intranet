import { redirect } from 'next/navigation';

/**
 * Route /media/albums — pas de vue dédiée, on redirige vers la médiathèque
 * qui affiche déjà la liste des albums en onglet par défaut.
 * Évite un 404 sur les prefetchs RSC de Next.js quand l'utilisateur hover
 * ou navigue depuis un enfant /media/albums/[slug].
 */
export default function MediaAlbumsIndex() {
  redirect('/media');
}
