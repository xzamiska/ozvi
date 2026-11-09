import { landingMetadata, LandingPage } from "../landing-page";

export const dynamic = "force-dynamic";
export const generateMetadata = () => landingMetadata("cs");

export default function Page() {
  return <LandingPage locale="cs" />;
}
