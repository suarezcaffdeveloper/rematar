/**
 * Wrappers finos sobre `lucide-react` (Épica 9, Etapa 3 -- rediseño, ver ADR-046):
 * migración gradual de los SVG a mano que este archivo tenía antes. Mismo nombre/props
 * (`{ className }`) que ya usaban todos los consumidores -- ninguno necesitó cambiar un
 * import. Todos quedan `aria-hidden`: el texto que los acompaña ya transmite la
 * información, son puramente decorativos.
 */

import {
  Box,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Gavel,
  Handshake,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  PartyPopper,
  Phone,
  RefreshCw,
  Search,
  Trophy,
  Truck,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';

type IconProps = { className?: string };

function wrap(Icon: LucideIcon) {
  return function WrappedIcon({ className }: IconProps) {
    return <Icon aria-hidden="true" className={className} />;
  };
}

export const CalendarIcon = wrap(Calendar);
export const PinIcon = wrap(MapPin);
export const BoxIcon = wrap(Box);
export const SearchIcon = wrap(Search);
export const PersonIcon = wrap(User);
export const ClockIcon = wrap(Clock);
export const UsersIcon = wrap(Users);
export const GavelIcon = wrap(Gavel);
export const TrophyIcon = wrap(Trophy);
export const MailIcon = wrap(Mail);
export const PhoneIcon = wrap(Phone);
export const PackageIcon = wrap(Package);
export const FileTextIcon = wrap(FileText);
export const MessageSquareIcon = wrap(MessageSquare);
export const RefreshIcon = wrap(RefreshCw);
export const HandshakeIcon = wrap(Handshake);
export const CreditCardIcon = wrap(CreditCard);
export const CheckCircleIcon = wrap(CheckCircle2);
export const TruckIcon = wrap(Truck);
export const PartyPopperIcon = wrap(PartyPopper);
