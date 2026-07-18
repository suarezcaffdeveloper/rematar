import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
