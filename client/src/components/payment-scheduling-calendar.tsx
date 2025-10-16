import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Calendar, AlertCircle, DollarSign, User } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, parseISO } from "date-fns";

interface DailySchedule {
  scheduleId: string;
  consumerId: string;
  consumerName: string;
  amountCents: number;
  arrangementType: string;
  accountId: string;
}

interface CalendarData {
  dailySchedules: Record<string, DailySchedule[]>;
  dailyTotals: Record<string, number>;
}

interface FailedPayment {
  scheduleId: string;
  consumerId: string;
  consumerName: string;
  consumerEmail: string;
  consumerPhone: string;
  amountCents: number;
  nextPaymentDate: string;
  failedAttempts: number;
  status: string;
  arrangementType: string;
  accountNumber?: string;
  creditor?: string;
}

export function PaymentSchedulingCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showFailedPayments, setShowFailedPayments] = useState(false);

  const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const { data: calendarData, isLoading } = useQuery<CalendarData>({
    queryKey: ['/api/scheduled-payments/calendar', startDate, endDate],
    queryFn: async () => {
      const response = await fetch(`/api/scheduled-payments/calendar?startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) throw new Error('Failed to fetch calendar data');
      return response.json();
    },
  });

  const { data: failedPayments = [] } = useQuery<FailedPayment[]>({
    queryKey: ['/api/scheduled-payments/failed'],
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getDateColor = (amountCents: number) => {
    if (amountCents === 0) return 'bg-gray-100 dark:bg-gray-800';
    if (amountCents < 10000) return 'bg-blue-100 dark:bg-blue-900/30';
    if (amountCents < 50000) return 'bg-green-100 dark:bg-green-900/30';
    if (amountCents < 100000) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-orange-100 dark:bg-orange-900/30';
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const selectedSchedules = selectedDate ? calendarData?.dailySchedules[selectedDate] || [] : [];

  const monthTotal = useMemo(() => {
    if (!calendarData) return 0;
    return Object.values(calendarData.dailyTotals).reduce((sum, amt) => sum + amt, 0);
  }, [calendarData]);

  const failedPaymentsCount = failedPayments.length;
  const criticalFailures = failedPayments.filter(p => p.failedAttempts >= 3).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Month Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(monthTotal)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Expected for {format(currentMonth, 'MMMM yyyy')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Failed Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{failedPaymentsCount}</div>
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto text-xs mt-1"
              onClick={() => setShowFailedPayments(true)}
              data-testid="button-view-failed"
            >
              View Details
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Critical Failures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{criticalFailures}</div>
            <p className="text-xs text-muted-foreground mt-1">
              3+ failed attempts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Payment Schedule Calendar
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                data-testid="button-prev-month"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-sm font-medium min-w-[140px] text-center">
                {format(currentMonth, 'MMMM yyyy')}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                data-testid="button-next-month"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {/* Day headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}

              {/* Calendar days */}
              {calendarDays.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayTotal = calendarData?.dailyTotals[dateStr] || 0;
                const hasPayments = dayTotal > 0;
                const isToday = isSameDay(day, new Date());

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`
                      min-h-[80px] p-2 rounded-lg border transition-all
                      ${hasPayments ? getDateColor(dayTotal) : 'bg-background'}
                      ${isToday ? 'ring-2 ring-primary' : ''}
                      ${selectedDate === dateStr ? 'ring-2 ring-blue-500' : ''}
                      hover:shadow-md
                    `}
                    data-testid={`calendar-day-${dateStr}`}
                  >
                    <div className="text-sm font-medium">{format(day, 'd')}</div>
                    {hasPayments && (
                      <div className="text-xs font-semibold mt-1">
                        {formatCurrency(dayTotal)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Date Details Dialog */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Scheduled Payments for {selectedDate && format(parseISO(selectedDate), 'MMMM d, yyyy')}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {selectedSchedules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No scheduled payments for this date
              </div>
            ) : (
              <div className="space-y-3">
                {selectedSchedules.map((schedule, idx) => (
                  <Card key={schedule.scheduleId} data-testid={`schedule-${idx}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium" data-testid={`consumer-name-${idx}`}>
                              {schedule.consumerName}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {schedule.arrangementType}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold" data-testid={`amount-${idx}`}>
                            {formatCurrency(schedule.amountCents)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Failed Payments Dialog */}
      <Dialog open={showFailedPayments} onOpenChange={setShowFailedPayments}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Failed Payments
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[500px]">
            {failedPayments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No failed payments
              </div>
            ) : (
              <div className="space-y-3">
                {failedPayments.map((payment, idx) => (
                  <Card 
                    key={payment.scheduleId} 
                    className={payment.failedAttempts >= 3 ? 'border-destructive' : ''}
                    data-testid={`failed-payment-${idx}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <div className="font-medium" data-testid={`failed-consumer-${idx}`}>
                            {payment.consumerName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {payment.consumerEmail} • {payment.consumerPhone}
                          </div>
                          {payment.accountNumber && (
                            <div className="text-xs text-muted-foreground">
                              Account: {payment.accountNumber} - {payment.creditor}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{formatCurrency(payment.amountCents)}</div>
                          <Badge 
                            variant={payment.failedAttempts >= 3 ? "destructive" : "secondary"}
                            data-testid={`failed-attempts-${idx}`}
                          >
                            {payment.failedAttempts} failed attempts
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Next attempt: {payment.nextPaymentDate ? format(parseISO(payment.nextPaymentDate), 'MMM d, yyyy') : 'N/A'}</span>
                        <span>•</span>
                        <span className="capitalize">{payment.arrangementType.replace('_', ' ')}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
