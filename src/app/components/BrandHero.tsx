import lockup from '../brand/soldiertrack-lockup.svg';
import banner from '../brand/soldiertrack-banner.svg';
import soldiers from '../brand/hero-soldiers.jpg';
import sleeve from '../brand/sleeve.jpg';
import camo from '../brand/camo.jpg';
import './BrandHero.css';

interface BrandHeroProps {
  /** Stacked shows the vertical lockup (phones); wide shows the horizontal banner (split layout). */
  variant?: 'stacked' | 'wide';
  photo?: 'soldiers' | 'sleeve';
}

/**
 * Dark brand panel for the white-on-transparent SoldierTrack lockups. Photo at reduced opacity
 * under a scrim so the white type keeps contrast, with a thin camo band at the foot.
 */
export function BrandHero({ variant = 'stacked', photo = 'soldiers' }: BrandHeroProps) {
  return (
    <div className={`brand-hero brand-hero--${variant}`} role="img" aria-label="SoldierTrack, personnel tracking system">
      <img className="brand-hero__photo" src={photo === 'sleeve' ? sleeve : soldiers} alt="" draggable={false} />
      <div className="brand-hero__scrim" />
      <img className="brand-hero__lockup" src={variant === 'wide' ? banner : lockup} alt="" draggable={false} />
      <div className="brand-hero__camo" style={{ backgroundImage: `url(${camo})` }} />
    </div>
  );
}
