import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserAvatar } from './UserAvatar';
import { AVATAR_PRESETS, presetAvatarUrl } from '../lib/avatarPresets';

describe('UserAvatar', () => {
  it('sin avatar_url, muestra las iniciales', () => {
    render(<UserAvatar avatarUrl={null} fullName="Ana Rematadora" />);

    expect(screen.getByText('AR')).toBeInTheDocument();
  });

  it('con una URL real, muestra la imagen', () => {
    const { container } = render(<UserAvatar avatarUrl="https://cdn.example.com/foto.jpg" fullName="Ana Rematadora" />);

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/foto.jpg');
  });

  it('con un avatar predeterminado válido, muestra la imagen del preset', () => {
    const preset = AVATAR_PRESETS[0];
    const { container } = render(<UserAvatar avatarUrl={presetAvatarUrl(preset.id)} fullName="Ana Rematadora" />);

    expect(container.querySelector('img')).toHaveAttribute('src', preset.image);
    expect(screen.queryByText('AR')).not.toBeInTheDocument();
  });

  it('con un preset desconocido, cae al avatar por defecto (iniciales)', () => {
    render(<UserAvatar avatarUrl="preset:no-existe" fullName="Ana Rematadora" />);

    expect(screen.getByText('AR')).toBeInTheDocument();
  });
});
