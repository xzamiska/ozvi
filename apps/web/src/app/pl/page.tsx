import { landingMetadata, LandingPage } from "../landing-page";

export const dynamic = "force-dynamic";
export const generateMetadata = () => landingMetadata("pl");

export default function Page() {
  return <LandingPage locale="pl" />;
}
