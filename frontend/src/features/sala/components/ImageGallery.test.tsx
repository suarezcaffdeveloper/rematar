import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageGallery } from './ImageGallery';

describe('ImageGallery', () => {
  it('sin imágenes, muestra el placeholder en vez de un <img> roto', () => {
    render(<ImageGallery images={[]} alt="Lote sin imágenes" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('con una sola imagen, la muestra sin tira de miniaturas', () => {
    render(
      <ImageGallery images={[{ url: 'https://example.com/a.jpg', order: 0, caption: null }]} alt="Lote" />,
    );

    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('con varias imágenes, la principal es la de menor "order"', () => {
    render(
      <ImageGallery
        images={[
          { url: 'https://example.com/second.jpg', order: 2, caption: null },
          { url: 'https://example.com/first.jpg', order: 1, caption: null },
        ]}
        alt="Lote"
      />,
    );

    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('src', 'https://example.com/first.jpg');
  });

  it('clickear una miniatura cambia la imagen principal', async () => {
    render(
      <ImageGallery
        images={[
          { url: 'https://example.com/first.jpg', order: 1, caption: null },
          { url: 'https://example.com/second.jpg', order: 2, caption: null },
        ]}
        alt="Lote"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Ver imagen 2 de 2' }));

    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('src', 'https://example.com/second.jpg');
  });

  it('con una sola imagen, no muestra flechas ni contador', () => {
    render(
      <ImageGallery images={[{ url: 'https://example.com/a.jpg', order: 0, caption: null }]} alt="Lote" />,
    );

    expect(screen.queryByRole('button', { name: 'Imagen siguiente' })).not.toBeInTheDocument();
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
  });

  const THREE_IMAGES = [
    { url: 'https://example.com/1.jpg', order: 1, caption: null },
    { url: 'https://example.com/2.jpg', order: 2, caption: null },
    { url: 'https://example.com/3.jpg', order: 3, caption: null },
  ];

  it('con varias imágenes, muestra el contador de posición', () => {
    render(<ImageGallery images={THREE_IMAGES} alt="Lote" />);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('la flecha "siguiente" avanza, con wraparound al llegar al final', async () => {
    render(<ImageGallery images={THREE_IMAGES} alt="Lote" />);
    const next = screen.getByRole('button', { name: 'Imagen siguiente' });

    await userEvent.click(next);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    await userEvent.click(next);
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    await userEvent.click(next);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('la flecha "anterior" retrocede, con wraparound al llegar al principio', async () => {
    render(<ImageGallery images={THREE_IMAGES} alt="Lote" />);

    await userEvent.click(screen.getByRole('button', { name: 'Imagen anterior' }));

    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('las flechas del teclado (←/→) cambian de imagen con el carrusel enfocado', async () => {
    render(<ImageGallery images={THREE_IMAGES} alt="Lote" />);
    const carousel = screen.getByRole('group', { name: /Galería de imágenes/ });
    carousel.focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('un swipe táctil hacia la izquierda avanza a la imagen siguiente', () => {
    render(<ImageGallery images={THREE_IMAGES} alt="Lote" />);
    const carousel = screen.getByRole('group', { name: /Galería de imágenes/ });

    fireEvent.touchStart(carousel, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 100 }] });

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('un toque sin desplazamiento significativo no cambia de imagen', () => {
    render(<ImageGallery images={THREE_IMAGES} alt="Lote" />);
    const carousel = screen.getByRole('group', { name: /Galería de imágenes/ });

    fireEvent.touchStart(carousel, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 190 }] });

    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });
});
