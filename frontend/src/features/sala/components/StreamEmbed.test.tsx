import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreamEmbed, buildYouTubeEmbedUrl } from './StreamEmbed';

describe('buildYouTubeEmbedUrl', () => {
  it('arma el src fijo de youtube-nocookie a partir de un ID válido', () => {
    expect(buildYouTubeEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1',
    );
  });

  it.each(['', 'corto', 'dQw4w9WgXcQextra', 'dQw4w9Wg"><', 'javascript:alert(1)', '../../evil'])(
    'rechaza IDs inválidos: %s',
    (id) => {
      expect(buildYouTubeEmbedUrl(id)).toBeNull();
    },
  );
});

describe('StreamEmbed', () => {
  it('no renderiza nada sin transmisión', () => {
    const { container } = render(<StreamEmbed provider={null} videoId={null} title="Remate" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no renderiza nada con un ID inválido', () => {
    const { container } = render(<StreamEmbed provider="youtube" videoId="<script>" title="Remate" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no renderiza nada con un proveedor desconocido', () => {
    const { container } = render(<StreamEmbed provider="vimeo" videoId="dQw4w9WgXcQ" title="Remate" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza el iframe con src y atributos de seguridad esperados', () => {
    render(<StreamEmbed provider="youtube" videoId="dQw4w9WgXcQ" title="Remate" />);
    const iframe = screen.getByTitle('Transmisión en vivo: Remate');
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1',
    );
    expect(iframe).toHaveAttribute('sandbox');
    expect(iframe).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    expect(screen.getByText(/unos segundos de retraso/i)).toBeInTheDocument();
  });

  it('es fijo: no ofrece ocultar el video', () => {
    render(<StreamEmbed provider="youtube" videoId="dQw4w9WgXcQ" title="Remate" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
