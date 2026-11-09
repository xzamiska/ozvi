import { landingMetadata, LandingPage } from "../landing-page";

export const dynamic = "force-dynamic";
export const generateMetadata = () => landingMetadata("en");

export default function Page() {
  return <LandingPage locale="en" />;
}
