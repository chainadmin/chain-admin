import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Consumers() {
  const { data: consumers, isLoading } = useQuery({
    queryKey: ["/api/consumers"],
  });

  return (
    <AdminLayout>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Consumers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your consumer database
          </p>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Consumer List</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading consumers...</div>
              ) : (consumers as any)?.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No consumers found. Import account data to get started.
                </div>
              ) : (
                <div className="space-y-4">
                  {(consumers as any)?.map((consumer: any) => (
                    <div key={consumer.id} className="border-b pb-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-700">
                            {consumer.firstName?.[0]}{consumer.lastName?.[0]}
                          </span>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-900">
                            {consumer.firstName} {consumer.lastName}
                          </p>
                          <p className="text-sm text-gray-500">{consumer.email}</p>
                          {consumer.phone && (
                            <p className="text-sm text-gray-500">{consumer.phone}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
