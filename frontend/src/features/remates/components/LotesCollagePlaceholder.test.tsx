import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LotesCollagePlaceholder } from './LotesCollagePlaceholder';

describe('LotesCollagePlaceholder', () => {
  it('sin imágenes, cae al degradé genérico (CoverPlaceholder), sin <img>', () => {
    const { container } = render(<LotesCollagePlaceholder images={[]} />);

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('.bg-gradient-to-br')).toBeInTheDocument();
  });

  it('con imágenes, renderiza una <img> por cada una, en el mismo orden', () => {
    const { container } = render(<LotesCollagePlaceholder images={['a.jpg', 'b.jpg', 'c.jpg']} />);

    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(3);
    expect(Array.from(imgs).map((img) => img.getAttribute('src'))).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('nunca supera las 4 imágenes que le pasan (quien arma la lista ya la recorta)', () => {
    const { container } = render(<LotesCollagePlaceholder images={['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']} />);
    expect(container.querySelectorAll('img')).toHaveLength(4);
  });
});
