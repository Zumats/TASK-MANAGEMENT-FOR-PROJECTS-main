import { BulletinBoard } from "@/components/bulletin/BulletinBoard";

export default function BulletinPage() {
  return (
    <div className="min-h-screen bg-[#06060c] pt-20 px-4 pb-12">
      <div className="max-w-5xl mx-auto">
        <BulletinBoard />
      </div>
    </div>
  );
}
