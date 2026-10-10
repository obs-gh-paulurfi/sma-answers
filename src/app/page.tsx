import Chat from "@/components/Chat";
import { parish } from "@/config/parish";

export default function Home() {
  return (
    <Chat
      appName={parish.appName}
      parishName={parish.name}
      contact={{ phone: parish.officePhone, email: parish.officeEmail, website: parish.website }}
    />
  );
}
