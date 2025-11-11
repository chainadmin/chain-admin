import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileText, CheckCircle, Clock, XCircle, Eye } from "lucide-react";

const signatureRequestSchema = z.object({
  consumerId: z.string().min(1, "Consumer is required"),
  documentId: z.string().min(1, "Document is required"),
  accountId: z.string().optional(),
  paymentAmount: z.string().optional(),
  paymentFrequency: z.string().optional(),
  numberOfPayments: z.string().optional(),
  arrangementStartDate: z.string().optional(),
  expiresInDays: z.coerce.number().min(1).max(90),
  message: z.string().optional(),
});

type SignatureRequestForm = z.infer<typeof signatureRequestSchema>;

export default function DocumentsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasArrangementOnFile, setHasArrangementOnFile] = useState(false);
  const [selectedConsumerId, setSelectedConsumerId] = useState("");

  const form = useForm<SignatureRequestForm>({
    resolver: zodResolver(signatureRequestSchema),
    defaultValues: {
      consumerId: "",
      documentId: "",
      accountId: "",
      paymentAmount: "",
      paymentFrequency: "",
      numberOfPayments: "",
      arrangementStartDate: "",
      expiresInDays: 7,
      message: "",
    },
  });

  const { data: consumers = [] } = useQuery<any[]>({
    queryKey: ["/api/consumers"],
  });

  const { data: documents = [] } = useQuery<any[]>({
    queryKey: ["/api/documents"],
  });

  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: signatureRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/signature-requests"],
  });

  // Fetch existing arrangement when consumer is selected
  const { data: existingArrangement } = useQuery({
    queryKey: ["/api/payment-schedules", selectedConsumerId],
    queryFn: async () => {
      if (!selectedConsumerId) return null;
      const response = await fetch(`/api/payment-schedules?consumerId=${selectedConsumerId}&status=active`);
      if (!response.ok) return null;
      const data = await response.json();
      return data && data.length > 0 ? data[0] : null;
    },
    enabled: !!selectedConsumerId,
  });

  // Pre-fill arrangement fields when existing arrangement is loaded
  if (existingArrangement && !hasArrangementOnFile) {
    setHasArrangementOnFile(true);
    form.setValue("paymentAmount", existingArrangement.amount ? (existingArrangement.amount / 100).toFixed(2) : "");
    form.setValue("paymentFrequency", existingArrangement.frequency || "");
    form.setValue("numberOfPayments", existingArrangement.numberOfPayments?.toString() || "");
    form.setValue("arrangementStartDate", existingArrangement.startDate ? new Date(existingArrangement.startDate).toISOString().split('T')[0] : "");
  }

  const createRequestMutation = useMutation({
    mutationFn: async (data: SignatureRequestForm) => {
      const response = await fetch("/api/signature-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          accountId: data.accountId || undefined,
          message: data.message || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create signature request");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Signature request sent" });
      queryClient.invalidateQueries({ queryKey: ["/api/signature-requests"] });
      form.reset();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send signature request",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SignatureRequestForm) => {
    createRequestMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-600" data-testid="badge-status-completed">
            <CheckCircle className="w-3 h-3 mr-1" />
            Signed
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" data-testid="badge-status-pending">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case "expired":
        return (
          <Badge variant="secondary" data-testid="badge-status-expired">
            <XCircle className="w-3 h-3 mr-1" />
            Expired
          </Badge>
        );
      default:
        return <Badge data-testid="badge-status-unknown">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-document-signatures">
            Document Signatures
          </h1>
          <p className="text-muted-foreground">Send documents for electronic signature</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-signature-request">
              <FileText className="w-4 h-4 mr-2" />
              New Signature Request
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Send Document for Signature</DialogTitle>
              <DialogDescription>
                Choose a consumer and document to send for electronic signature
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="consumerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Consumer *</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedConsumerId(value);
                          setHasArrangementOnFile(false);
                        }} 
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-consumer">
                            <SelectValue placeholder="Select consumer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {consumers.map((consumer: any) => (
                            <SelectItem key={consumer.id} value={consumer.id}>
                              {consumer.firstName} {consumer.lastName} - {consumer.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="documentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-document">
                            <SelectValue placeholder="Select document" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {documents.map((doc: any) => (
                            <SelectItem key={doc.id} value={doc.id}>
                              {doc.fileName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-account">
                            <SelectValue placeholder="Select account (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {accounts.map((account: any) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.accountNumber} - {account.companyName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Payment Arrangement (Optional)</h3>
                    {hasArrangementOnFile && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200" data-testid="badge-arrangement-on-file">
                        Arrangement on File
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="paymentAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Amount</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              {...field}
                              data-testid="input-payment-amount"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="paymentFrequency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Frequency</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-payment-frequency">
                                <SelectValue placeholder="Select frequency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="numberOfPayments"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Number of Payments</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              placeholder="12"
                              {...field}
                              data-testid="input-number-of-payments"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="arrangementStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-arrangement-start-date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="expiresInDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expires In (Days)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="90"
                          {...field}
                          data-testid="input-expires-days"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Message (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add a custom message for the recipient"
                          {...field}
                          data-testid="input-message"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createRequestMutation.isPending}
                    data-testid="button-send-request"
                  >
                    {createRequestMutation.isPending ? "Sending..." : "Send Request"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signature Requests</CardTitle>
          <CardDescription>Track all document signature requests</CardDescription>
        </CardHeader>
        <CardContent>
          {signatureRequests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-requests">
              No signature requests yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consumer</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signatureRequests.map((request: any) => (
                  <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                    <TableCell data-testid={`text-consumer-${request.id}`}>
                      {request.consumer?.firstName} {request.consumer?.lastName}
                    </TableCell>
                    <TableCell data-testid={`text-document-${request.id}`}>
                      {request.document?.fileName}
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell data-testid={`text-sent-${request.id}`}>
                      {new Date(request.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell data-testid={`text-expires-${request.id}`}>
                      {new Date(request.expiresAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`button-view-${request.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
