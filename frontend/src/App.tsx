import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';

/**
 * No hay un `AppProviders` con varios `<Context.Provider>` anidados: Zustand no
 * necesita un provider de React (los stores son módulos importables directamente,
 * ver ADR-027) y `RouterProvider` ya cumple ese rol para el ruteo. El día que haga
 * falta un provider real (por ejemplo, uno de una librería de terceros), este es el
 * lugar donde envolver `<RouterProvider />`.
 */
export function App() {
  return <RouterProvider router={router} />;
}
