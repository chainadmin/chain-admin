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
    queryKey: [`/api/scheduled-payments/calendar?startDate=${startDate}&endDate=${endDate}`],
  });

  const { data: failedPayments = [] } = useQuery<FailedPayment[]>({
    queryKey: ['/api/scheduled-payments/failed'],
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getDateColor = (amountCents: number) => {
    if (amountCents === 0) return 'bg-white/5';
    if (amountCents < 10000) return 'bg-sky-500/20';
    if (amountCents < 50000) return 'bg-emerald-500/20';
    if (amountCents < 100000) return 'bg-amber-500/20';
    return 'bg-orange-500/20';
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
        <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-white">
              <DollarSign className="w-4 h-4 text-emerald-300" />
              Month Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatCurrency(monthTotal)}</div>
            <p className="text-xs text-blue-100/70 mt-1">
              Expected for {format(currentMonth, 'MMMM yyyy')}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-white">
              <AlertCircle className="w-4 h-4 text-amber-300" />
              Failed Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{failedPaymentsCount}</div>
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto text-xs mt-1 text-sky-300 hover:text-sky-200"
              onClick={() => setShowFailedPayments(true)}
              data-testid="button-view-failed"
            >
              View Details
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-white">
              <Calendar className="w-4 h-4 text-rose-300" />
              Critical Failures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-300">{criticalFailures}</div>
            <p className="text-xs text-blue-100/70 mt-1">
              3+ failed attempts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <Card className="rounded-3xl border-white/10 bg-white/5 text-blue-50 shadow-lg shadow-blue-900/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-white">
              <Calendar className="w-5 h-5 text-sky-300" />
              Payment Schedule Calendar
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                data-testid="button-prev-month"
                className="border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-sm font-medium min-w-[140px] text-center text-white">
                {format(currentMonth, 'MMMM yyyy')}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                data-testid="button-next-month"
                className="border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-blue-100/70">Loading...</div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {/* Day headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-sm font-medium text-blue-100/70 py-2">
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
                      min-h-[80px] p-2 rounded-lg border border-white/10 transition-all text-white
                      ${getDateColor(dayTotal)}
                      ${hasPayments ? 'hover:brightness-110' : 'hover:bg-white/10'}
                      ${isToday ? 'ring-2 ring-sky-400' : ''}
                      ${selectedDate === dateStr ? 'ring-2 ring-blue-500' : ''}
                      hover:shadow-md
                    `}
                    data-testid={`calendar-day-${dateStr}`}
                  >
                    <div className="text-sm font-medium">{format(day, 'd')}</div>
                    {hasPayments && (
                      <div className="text-xs font-semibold mt-1 text-emerald-300">
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
        <DialogContent className="max-w-2xl border border-white/10 bg-[#0f1a3c] text-blue-100">
          <DialogHeader>
            <DialogTitle className="text-white">
              Scheduled Payments for {selectedDate && format(parseISO(selectedDate), 'MMMM d, yyyy')}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {selectedSchedules.length === 0 ? (
              <div className="text-center py-8 text-blue-100/70">
                No scheduled payments for this date
              </div>
            ) : (
              <div className="space-y-3">
                {selectedSchedules.map((schedule, idx) => (
                  <Card key={schedule.scheduleId} data-testid={`schedule-${idx}`} className="rounded-2xl border-white/10 bg-white/5">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-sky-300" />
                            <span className="font-medium text-white" data-testid={`consumer-name-${idx}`}>
                              {schedule.consumerName}
                            </span>
                          </div>
                          <div className="text-sm text-blue-100/70">
                            <Badge variant="outline" className="text-xs border-white/20 bg-white/10 text-blue-100">
                              {schedule.arrangementType}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-emerald-300" data-testid={`amount-${idx}`}>
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
        <DialogContent className="max-w-4xl border border-white/10 bg-[#0f1a3c] text-blue-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <AlertCircle className="w-5 h-5 text-rose-300" />
              Failed Payments
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[500px]">
            {failedPayments.length === 0 ? (
              <div className="text-center py-8 text-blue-100/70">
                No failed payments
              </div>
            ) : (
              <div className="space-y-3">
                {failedPayments.map((payment, idx) => (
                  <Card 
                    key={payment.scheduleId} 
                    className={`rounded-2xl border-white/10 bg-white/5 ${payment.failedAttempts >= 3 ? 'border-rose-400/40' : ''}`}
                    data-testid={`failed-payment-${idx}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <div className="font-medium text-white" data-testid={`failed-consumer-${idx}`}>
                            {payment.consumerName}
                          </div>
                          <div className="text-sm text-blue-100/70">
                            {payment.consumerEmail} • {payment.consumerPhone}
                          </div>
                          {payment.accountNumber && (
                            <div className="text-xs text-blue-100/60">
                              Account: {payment.accountNumber} - {payment.creditor}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-white">{formatCurrency(payment.amountCents)}</div>
                          <Badge 
                            variant={payment.failedAttempts >= 3 ? "destructive" : "secondary"}
                            data-testid={`failed-attempts-${idx}`}
                            className={payment.failedAttempts >= 3 ? "bg-rose-500/20 text-rose-200 border-rose-400/30" : "bg-amber-500/20 text-amber-200 border-amber-400/30"}
                          >
                            {payment.failedAttempts} failed attempts
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-blue-100/60">
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
