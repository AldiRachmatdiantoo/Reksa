import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Pindah halaman selalu mulai dari atas; tautan #anchor di halaman yang sama tidak terpengaruh. */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
