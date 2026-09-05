        console.error("Error sending callback notification email:", emailError);
        // Don't fail the request if email fails
      }
      
      // Send callback request to SMAX as notes for all consumer accounts with filenumbers
      // This is especially important for arrangement change requests
      try {
        const consumerAccounts = await storage.getAccountsByConsumer(consumer.id);
        
        for (const account of consumerAccounts) {
          if (account.filenumber) {
            console.log('📤 Sending callback request to SMAX for account:', account.filenumber);
            
            const consumerName = `${consumer.firstName} ${consumer.lastName}`;
            const noteMessage = message 
              ? `CONSUMER CALLBACK REQUEST: ${consumerName} (${consumer.email}) requested callback. Preferred time: ${preferredTime || 'Anytime'}. Message: ${message}. Phone: ${phoneNumber || consumer.phone || 'Not provided'}`
              : `CONSUMER CALLBACK REQUEST: ${consumerName} (${consumer.email}) requested callback. Preferred time: ${preferredTime || 'Anytime'}. Phone: ${phoneNumber || consumer.phone || 'Not provided'}`;
            
            const smaxNote = {
              filenumber: account.filenumber,
              logmessage: noteMessage,
              collectorname: 'Consumer Portal'
            };
            
            const smaxSuccess = await smaxService.insertNote(tenant.id, smaxNote);
            if (smaxSuccess) {
              console.log('✅ Callback request sent to SMAX successfully');
            } else {
              console.log('⚠️ Failed to send callback request to SMAX (non-blocking)');
            }
          }
        }
      } catch (smaxError) {
        console.error('⚠️ Error sending callback request to SMAX (non-blocking):', smaxError);
        // Don't fail the request if SMAX sync fails
      }

      res.json({ 
        message: "Callback request submitted successfully", 
        requestId: callbackRequest.id 
      });
    } catch (error) {
      console.error("Error creating consumer callback request:", error);
      res.status(500).json({ message: "Failed to submit callback request" });
    }
  });

  // Test USAePay connection endpoint
  app.post('/api/usaepay/test-connection', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      
      if (!tenantId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const settings = await storage.getTenantSettings(tenantId);
      
      if (!settings) {
        return res.status(404).json({ success: false, message: "Settings not found" });
      }

      const { merchantApiKey, merchantApiPin, merchantName, useSandbox } = settings;

      console.log('🔍 USAePay Test - Credentials found:', {
        hasApiKey: !!merchantApiKey,
        apiKeyLength: merchantApiKey?.length || 0,
        hasApiPin: !!merchantApiPin,
        apiPinLength: merchantApiPin?.length || 0,
        merchantName,
        useSandbox
      });

      if (!merchantApiKey || !merchantApiPin) {
        return res.status(400).json({ 
          success: false, 
          message: "USAePay credentials not configured. Please add your API Key and PIN." 
        });
      }

      // Determine API endpoint based on sandbox mode
      const baseUrl = useSandbox 
        ? "https://sandbox.usaepay.com/api/v2"
        : "https://secure.usaepay.com/api/v2";

      console.log('🔗 Testing connection to:', baseUrl);

      // Create proper USAePay API v2 authentication header with hash
      const authHeader = generateUSAePayAuthHeader(merchantApiKey, merchantApiPin);

      // Test connection by making a simple API call (get merchant info)
      const testResponse = await fetch(`${baseUrl}/merchant`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      console.log('📡 USAePay Response:', {
        status: testResponse.status,
        statusText: testResponse.statusText,
        ok: testResponse.ok
      });

      if (testResponse.ok) {
        try {
          const merchantData = await testResponse.json();
          console.log('✅ USAePay connection successful:', merchantData);
          return res.json({ 
            success: true, 
            message: `Successfully connected to ${useSandbox ? 'Sandbox' : 'Production'} USAePay`,
            merchantName: merchantData.name || merchantName || "Unknown",
            mode: useSandbox ? 'sandbox' : 'production'
          });
        } catch (e) {
          // Empty response body but 200 OK - consider it a success
          console.log('✅ USAePay connection successful (empty response)');
          return res.json({ 
            success: true, 
            message: `Successfully connected to ${useSandbox ? 'Sandbox' : 'Production'} USAePay`,
            merchantName: merchantName || "Unknown",
            mode: useSandbox ? 'sandbox' : 'production'
          });
        }
      } else {
        const errorData = await testResponse.text();
        console.error('❌ USAePay connection failed:', errorData);
        
        // Common error messages
        let message = 'Connection failed. ';
        if (testResponse.status === 401) {
          message += 'Invalid API Key or PIN. Please verify your credentials.';
        } else if (testResponse.status === 403) {
          message += 'Access forbidden. Please check your account permissions.';
        } else if (testResponse.status === 404) {
          message += 'API endpoint not found. Please verify your USAePay account.';
        } else {
          message += `${testResponse.statusText}. Please verify your credentials.`;
        }
        
        return res.json({ 
          success: false, 
          message,
          error: errorData,
          status: testResponse.status
        });
      }
    } catch (error: any) {
      console.error("❌ USAePay test connection error:", error);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to test connection. Please check your credentials and try again.",
        error: error.message 
      });
    }
  });

  // Test Authorize.net connection endpoint
  app.post('/api/authorizenet/test-connection', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const settings = await storage.getTenantSettings(tenantId);
      if (!settings) {
        return res.status(404).json({ success: false, message: "Settings not found" });
      }

      const { authnetApiLoginId, authnetTransactionKey, useSandbox } = settings;

      if (!authnetApiLoginId || !authnetTransactionKey) {
        return res.status(400).json({
          success: false,
          message: "Authorize.net credentials not configured. Please add your API Login ID and Transaction Key."
        });
      }

      console.log('🔍 Authorize.net Test - Credentials found:', {
        apiLoginId: authnetApiLoginId.substring(0, 4) + '****',
        mode: useSandbox ? 'sandbox' : 'production'
      });

      const authnetService = new AuthnetService({
        apiLoginId: authnetApiLoginId,
        transactionKey: authnetTransactionKey,
        useSandbox: useSandbox ?? true,
      });

      const result = await authnetService.testConnection();

      if (result.success) {
        return res.json({
          success: true,
          message: result.message,
          mode: useSandbox ? 'sandbox' : 'production'
        });
      } else {
        return res.json({
          success: false,
          message: result.message
        });
      }
    } catch (error: any) {
      console.error("❌ Authorize.net test connection error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to test connection. Please check your credentials and try again.",
        error: error.message
      });
    }
  });

  // Test NMI connection endpoint
  app.post('/api/nmi/test-connection', authenticateUser, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const settings = await storage.getTenantSettings(tenantId);
      if (!settings) {
        return res.status(404).json({ success: false, message: "Settings not found" });
      }

      const { nmiSecurityKey } = settings;

      if (!nmiSecurityKey) {
        return res.status(400).json({
          success: false,
          message: "NMI credentials not configured. Please add your Security Key."
        });
      }

      console.log('🔍 NMI Test - Validating credentials...');

      const { NMIService } = await import('./nmiService');
      const nmiService = new NMIService({
        securityKey: nmiSecurityKey,
      });

      const result = await nmiService.testConnection();

      if (result.success) {
        return res.json({
          success: true,
          message: result.message || 'Successfully connected to NMI',
        });
      } else {
        return res.json({
          success: false,
          message: result.message || 'Failed to connect to NMI'
        });
      }
    } catch (error: any) {
      console.error("❌ NMI test connection error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to test connection. Please check your credentials and try again.",
        error: error.message
      });
    }
  });

  // Helper function to generate USAePay API v2 authentication header
  function generateUSAePayAuthHeader(apiKey: string, apiPin: string): string {
    // Generate 16-character random seed
    const seed = Array.from({ length: 16 }, () => 
      Math.random().toString(36).charAt(2)
    ).join('');
    
    // Create prehash: apikey + seed + apipin
    const prehash = apiKey + seed + apiPin;
    
    // Create SHA-256 hash
    const hash = crypto.createHash('sha256').update(prehash).digest('hex');
    
    // Create apihash: s2/seed/hash
    const apihash = `s2/${seed}/${hash}`;
    
    // Create final auth key: base64(apikey:apihash)
    const authKey = Buffer.from(`${apiKey}:${apihash}`).toString('base64');
    
    return `Basic ${authKey}`;
  }

  function detectProcessorForPayment(settings: any, paymentMethod?: any): 'usaepay' | 'authorize_net' | 'nmi' {
    const settingValue = settings?.merchantProvider || 'usaepay';

    if (paymentMethod?.paymentToken) {
      const token = paymentMethod.paymentToken;
      if (token.startsWith('nmi_vault_')) {
        if (settingValue !== 'nmi') {
          console.warn(`⚠️ [PROCESSOR MISMATCH] Token is NMI vault but tenant merchantProvider='${settingValue}'. Using NMI for this payment method.`);
        }
        return 'nmi';
      }
      if (token.includes('|')) {
        if (settingValue !== 'authorize_net') {
          console.warn(`⚠️ [PROCESSOR MISMATCH] Token is Authorize.net format but tenant merchantProvider='${settingValue}'. Using Authorize.net for this payment method.`);
        }
        return 'authorize_net';
      }
    }

    const hasUsaepay = !!(settings?.merchantApiKey?.trim() && settings?.merchantApiPin?.trim());
    const hasAuthnet = !!(settings?.authnetApiLoginId?.trim() && settings?.authnetTransactionKey?.trim());
    const hasNmi = !!settings?.nmiSecurityKey?.trim();

    if (settingValue === 'nmi' && !hasNmi && hasUsaepay) {
      console.warn(`⚠️ [PROCESSOR OVERRIDE] merchantProvider='nmi' but NO NMI key configured. USAePay credentials found. Using USAePay.`);
      return 'usaepay';
    }
    if (settingValue === 'nmi' && !hasNmi && hasAuthnet) {
      console.warn(`⚠️ [PROCESSOR OVERRIDE] merchantProvider='nmi' but NO NMI key configured. Authorize.net credentials found. Using Authorize.net.`);
      return 'authorize_net';
    }
    if (settingValue === 'authorize_net' && !hasAuthnet && hasUsaepay) {
      console.warn(`⚠️ [PROCESSOR OVERRIDE] merchantProvider='authorize_net' but NO Authnet credentials. USAePay credentials found. Using USAePay.`);
      return 'usaepay';
    }
    if (settingValue === 'usaepay' && !hasUsaepay && hasNmi) {
      console.warn(`⚠️ [PROCESSOR OVERRIDE] merchantProvider='usaepay' but NO USAePay credentials. NMI key found. Using NMI.`);
      return 'nmi';
    }
    if (settingValue === 'usaepay' && !hasUsaepay && hasAuthnet) {
      console.warn(`⚠️ [PROCESSOR OVERRIDE] merchantProvider='usaepay' but NO USAePay credentials. Authorize.net credentials found. Using Authorize.net.`);
      return 'authorize_net';
    }
    if (settingValue === 'authorize_net' && !hasAuthnet && hasNmi) {
      console.warn(`⚠️ [PROCESSOR OVERRIDE] merchantProvider='authorize_net' but NO Authnet credentials. NMI key found. Using NMI.`);
      return 'nmi';
    }

    console.log(`🏦 [PROCESSOR] Using merchantProvider='${settingValue}' (credentials confirmed: USAePay=${hasUsaepay}, Authnet=${hasAuthnet}, NMI=${hasNmi})`);
    return settingValue as 'usaepay' | 'authorize_net' | 'nmi';
  }

  // Helper function to process successful payment (unified for all processors)
  async function processSuccessfulPayment(params: {
    tenantId: string;
    consumerId: string;
    accountId: string | null;
    account: any;
    amountCents: number;
    transactionId: string | null;
    processorResponse: any;
    cardLast4: string;
    cardName: string;
    zipCode?: string;
    arrangement: any;
    settings: any;
    isSmaxArrangementPayment?: boolean;
  }): Promise<any> {
    const {
      tenantId,
      consumerId,
      accountId,
      account,
      amountCents,
      transactionId,
      processorResponse,
      cardLast4,
      cardName,
      zipCode,
      arrangement,
      settings,
      isSmaxArrangementPayment = false,
    } = params;

    console.log('💾 Processing successful payment...');

    // Create payment record with enhanced error logging
    const paymentData = {
      tenantId,
      consumerId,
      accountId: accountId || null,
      amountCents,
      paymentMethod: 'credit_card',
      status: 'completed',
      transactionId: transactionId || undefined,
      processorResponse: JSON.stringify(processorResponse),
      processedAt: new Date(),
      notes: arrangement
        ? `${arrangement.name} - ${cardName} ending in ${cardLast4}`
        : `Online payment - ${cardName} ending in ${cardLast4}`,
    };

    console.log('💾 Attempting to create payment record in database:', {
      tenantId,
      consumerId,
      accountId,
      amountCents,
      transactionId,
      cardLast4,
      timestamp: new Date().toISOString()
    });

    let payment;
    try {
      payment = await storage.createPayment(paymentData);
      
      console.log('✅ Payment record created successfully:', {
        paymentId: payment.id,
        amountCents: payment.amountCents,
        status: payment.status,
        transactionId: payment.transactionId
      });
    } catch (dbError: any) {
      console.error('❌❌❌ CRITICAL: Database payment insert failed! ❌❌❌');
      console.error('Payment data that failed to save:', {
        tenantId,
        consumerId,
        accountId,
        amountCents: amountCents / 100, // Show dollars
        transactionId,
        cardLast4,
        processorName: settings?.merchantProvider || 'unknown',
        timestamp: new Date().toISOString()
      });
      console.error('Database error details:', {
        name: dbError.name,
        message: dbError.message,
        code: dbError.code,
        constraint: dbError.constraint,
        detail: dbError.detail,
        stack: dbError.stack
      });
      console.error('⚠️ PROCESSOR CHARGED BUT DATABASE FAILED - MANUAL RECONCILIATION REQUIRED');
      
      // Rethrow original error to preserve stack trace
      // Outer error handler will return generic message to client
      throw dbError;
    }

    // Trigger payment event for sequence enrollment
    await eventService.emitSystemEvent('payment_received', {
      tenantId,
      consumerId,
      accountId: accountId || undefined,
      metadata: { paymentId: payment.id, amountCents, transactionId }
    });
    
    // Trigger one_time_payment event if not part of an arrangement (standalone payment)
    // Exclude SMAX arrangement payments - they're payments on existing external arrangements
    if (!arrangement && !isSmaxArrangementPayment) {
      await eventService.emitSystemEvent('one_time_payment', {
        tenantId,
        consumerId,
        accountId: accountId || undefined,
        metadata: { paymentId: payment.id, amountCents, transactionId }
      });
    }
    
    // NOTE: SMAX payment sync is handled by each processor section (NMI, Authorize.net, USAePay)
    // after calling this helper, because they have access to card expiry, token, and other details
    // that this helper doesn't receive.

    // Update account balance if accountId exists
    if (accountId) {
      console.log('💰 [BALANCE UPDATE] Starting balance update for account:', accountId);
      // Re-read the account fresh to get current balance
      const freshAccount = await storage.getAccount(accountId);
      if (freshAccount) {
        const previousBalance = freshAccount.balanceCents || 0;
        const isSinglePaymentSettlement = arrangement?.planType === 'settlement' && (!(arrangement as any).settlementPaymentCount || (arrangement as any).settlementPaymentCount <= 1);
        const newBalance = isSinglePaymentSettlement ? 0 : Math.max(0, previousBalance - amountCents);
        console.log('💰 [BALANCE UPDATE] Calculating:', {
          accountId,
          previousBalance,
          paymentAmount: amountCents,
          isSinglePaymentSettlement,
          newBalance,
          formula: isSinglePaymentSettlement ? 'Settlement in full → $0' : `max(0, ${previousBalance} - ${amountCents}) = ${newBalance}`
        });
        const updatedAccount = await storage.updateAccount(accountId, { balanceCents: newBalance });
        console.log('💰 [BALANCE UPDATE] Update complete:', {
          accountId,
          balanceAfterUpdate: updatedAccount?.balanceCents,
          success: updatedAccount?.balanceCents === newBalance
        });
      } else {
        console.error('❌ [BALANCE UPDATE] Account not found:', accountId);
      }
    } else {
      console.log('⚠️ [BALANCE UPDATE] No accountId provided, skipping balance update');
    }

    // Send notification to admins about successful payment
    const consumer = await storage.getConsumer(consumerId);
    console.log('📧 Payment Email Notification Check:', {
      hasConsumer: !!consumer,
      consumerName: consumer ? `${consumer.firstName} ${consumer.lastName}` : 'N/A',
      accountNumber: account?.accountNumber || 'N/A',
      amountCents,
      amountDollars: (amountCents / 100).toFixed(2),
      transactionId
    });
    
    if (consumer) {
      console.log('📧 Sending payment notification to tenant admins...');
      await notifyTenantAdmins({
        tenantId,
        subject: 'New Payment Received',
        eventType: 'payment_made',
        consumer: {
          firstName: consumer.firstName || '',
          lastName: consumer.lastName || '',
          email: consumer.email || '',
        },
        amount: amountCents,
      }).catch(err => console.error('❌ Failed to send payment notification to admins:', err));

      console.log('📧 Sending payment notification to contact email...');
      await emailService.sendPaymentNotification({
        tenantId,
        consumerName: `${consumer.firstName} ${consumer.lastName}`,
        accountNumber: account?.accountNumber || 'N/A',
        amountCents,
        paymentMethod: 'Credit Card',
        transactionId: transactionId || undefined,
        paymentType: 'one_time',
      }).catch(err => console.error('❌ Failed to send payment notification to contact email:', err));
      
      console.log('✅ Payment notifications sent successfully');
    } else {
      console.warn('⚠️ Consumer not found - skipping payment notifications');
    }

    // Sync payment to DMP if enabled
    try {
      const tenantSettings = await storage.getTenantSettings(tenantId);
      if ((tenantSettings as any)?.dmpEnabled && account) {
        console.log('🔄 Syncing payment to DMP...');
        const { dmpService } = await import('./dmpService');
        await dmpService.postPayment(tenantId, {
          filenumber: account.filenumber || account.accountNumber,
          amount: amountCents / 100,
          date: new Date(),
          type: 'payment',
          reference: transactionId || `CHAIN-${payment.id}`,
          status: 'completed',
        });
        console.log('✅ Payment synced to DMP');
      }
    } catch (dmpError) {
      console.error('⚠️ Failed to sync payment to DMP (non-blocking):', dmpError);
    }

    return payment;
  }

  // Consumer payment processing endpoint
  app.post('/api/consumer/payments/process', authenticateConsumer, async (req: any, res) => {
    console.log('🎯 === CONSUMER PAYMENT REQUEST RECEIVED ===');
    console.log('📥 Request body:', JSON.stringify({
      ...req.body,
      cardNumber: req.body.cardNumber ? '****' + req.body.cardNumber.slice(-4) : 'none',
      cvv: req.body.cvv ? '***' : 'none'
    }, null, 2));
    
    try {
      const { id: consumerId, tenantId } = req.consumer || {};

      if (!consumerId || !tenantId) {
        console.log('❌ Unauthorized: No consumer ID or tenant ID');
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      console.log('👤 Consumer:', { consumerId, tenantId });

      const {
        accountId,
        arrangementId,
        settlementPaymentCount: requestedSettlementPaymentCount,
        cardNumber,
        expiryMonth,
        expiryYear,
        cvv,
        cardName,
        zipCode,
        saveCard,
        setupRecurring,
        firstPaymentDate,
        customPaymentAmountCents,
        paymentDate, // For retrying failed SMAX payments with specific date
        simplifiedFlow, // New simplified arrangement flow data
        manualArrangementId, // Consumer paying against an admin-created manual arrangement
        opaqueDataDescriptor, // Authorize.net tokenized data
        opaqueDataValue // Authorize.net tokenized data
      } = req.body;

      let normalizedFirstPaymentDate: Date | null = null;
      if (firstPaymentDate) {
        const parsedDate = new Date(firstPaymentDate);
        if (Number.isNaN(parsedDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid first payment date provided",
          });
        }
        parsedDate.setHours(0, 0, 0, 0);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // For recurring arrangements (range/fixed_monthly), cap first payment at next Friday
        if (setupRecurring && arrangementId) {
          const maxFirstPaymentDate = calculateFirstPaymentDueDate();
          if (parsedDate > maxFirstPaymentDate) {
            return res.status(400).json({
              success: false,
              message: `First payment date cannot be later than ${maxFirstPaymentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`,
            });
          }
        } else {
          // Non-recurring payments: keep original 1-month limit
          const oneMonthFromNow = new Date(today);
          oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
          if (parsedDate > oneMonthFromNow) {
            return res.status(400).json({
              success: false,
              message: "First payment date cannot be more than one month in the future",
            });
          }
        }
        
        normalizedFirstPaymentDate = parsedDate;
      } else if (setupRecurring && arrangementId) {
        // If setting up recurring but no date provided, default to today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        normalizedFirstPaymentDate = today;
      }

      // Parse paymentDate for one-time payments (used for retrying failed SMAX payments)
      // This date is ONLY for SMAX sync attribution, not for the actual processedAt timestamp
      let normalizedPaymentDate: Date | null = null;
      if (paymentDate) {
        // Validate date format (YYYY-MM-DD)
        if (typeof paymentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
          return res.status(400).json({
            success: false,
            message: "Payment date must be in YYYY-MM-DD format",
          });
        }
        
        const parsedDate = new Date(paymentDate + 'T00:00:00.000Z'); // Parse as UTC to avoid timezone issues
        if (Number.isNaN(parsedDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid payment date provided",
          });
        }
        
        // Prevent future dates - payment can only be for today or past dates
        const todayUTC = new Date();
        todayUTC.setHours(0, 0, 0, 0);
        if (parsedDate > todayUTC) {
          return res.status(400).json({
            success: false,
            message: "Payment date cannot be in the future",
          });
        }
        
        normalizedPaymentDate = parsedDate;
        console.log('📅 Payment date specified for SMAX retry:', normalizedPaymentDate.toISOString().split('T')[0]);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Validate payment data - either raw card data or Authorize.net tokenized data
      const hasRawCardData = cardNumber && expiryMonth && expiryYear && cvv;
      const hasAuthnetToken = opaqueDataDescriptor && opaqueDataValue;
      
      if (!accountId || !cardName || (!hasRawCardData && !hasAuthnetToken)) {
        return res.status(400).json({ message: "Missing required payment information" });
      }

      // Fetch and validate the account belongs to this consumer
      const account = await storage.getAccount(accountId);
      if (!account || account.consumerId !== consumerId || account.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied to this account" });
      }
      
      // Check if account status is blocked (configured per tenant)
      // This checks SMAX statusname (if SMAX enabled) or Chain's account status
      const tenantSettings = await storage.getTenantSettings(tenantId);
      const statusValidation = await validatePaymentStatus(account, tenantId, tenantSettings);
      // Skip "declined" status block for consumer-initiated payments — "declined" is auto-set by
      // failed payment attempts and must never permanently prevent a consumer from retrying.
      const isDeclinedOnly = statusValidation.isBlocked && statusValidation.status?.toLowerCase() === 'declined';
      if (statusValidation.isBlocked && !isDeclinedOnly) {
        console.log(`❌ Payment blocked: ${statusValidation.reason}`);
        return res.status(403).json({ 
          success: false,
          message: "This account is not eligible for payments at this time. Please contact us for assistance." 
        });
      }
      if (isDeclinedOnly) {
        console.log(`⚠️ Account status is "declined" (from prior failed payment) — allowing consumer retry`);
      }

      // DUPLICATE PAYMENT PROTECTION: Check if a similar payment was processed recently
      // This prevents double-charges from network timeouts, double-clicks, or browser back/refresh
      const paymentAmountToCheck = customPaymentAmountCents || account.balanceCents || 0;
      if (paymentAmountToCheck > 0) {
        const recentDuplicate = await storage.checkRecentDuplicatePayment(
          consumerId,
          accountId,
          paymentAmountToCheck,
          5 // 5-minute window
        );
        
        if (recentDuplicate) {
          console.log(`⚠️ DUPLICATE PAYMENT BLOCKED: Found recent payment for same consumer/account/amount`, {
            existingPaymentId: recentDuplicate.id,
            existingTransactionId: recentDuplicate.transactionId,
            existingCreatedAt: recentDuplicate.createdAt,
            consumerId,
            accountId,
            amountCents: paymentAmountToCheck
          });
          return res.status(409).json({
            success: false,
            message: "A payment for this amount was already processed within the last few minutes. Please check your payment history before trying again.",
            existingPaymentId: recentDuplicate.id,
            existingTransactionId: recentDuplicate.transactionId
          });
        }
      }


      // Look up manual arrangement if consumer is paying against one
      let manualArrangement: any = null;
      if (manualArrangementId) {
        const [found] = await db.select().from(manualArrangements)
          .where(and(
            eq(manualArrangements.id, manualArrangementId),
            eq(manualArrangements.consumerId, consumerId),
            eq(manualArrangements.accountId, accountId),
            eq(manualArrangements.tenantId, tenantId),
            eq(manualArrangements.status, 'active')
          ));
        if (!found) {
          return res.status(400).json({ success: false, message: "Manual payment plan not found or no longer active" });
        }
        manualArrangement = found;
        console.log('📋 Manual arrangement found:', { id: found.id, name: found.name, totalAmountCents: found.totalAmountCents });
      }

      // Get arrangement if specified
      let arrangement = null;
      let amountCents = account.balanceCents || 0;
      let isSimplifiedFlow = false;
      let simplifiedArrangementData = null;
      
      console.log('📋 Arrangement check:', {
        hasArrangementId: !!arrangementId,
        hasSimplifiedFlow: !!simplifiedFlow,
        arrangementId,
        accountBalance: amountCents,
        forceArrangement: tenantSettings?.forceArrangement
      });
      
      // Handle simplified flow (new consumer-friendly arrangement creation)
      if (simplifiedFlow) {
        isSimplifiedFlow = true;
        const { paymentMethod, selectedTerm, paymentFrequency, calculatedPaymentCents } = simplifiedFlow;
        
        console.log('✨ Processing simplified flow:', {
          paymentMethod,
          selectedTerm,
          paymentFrequency,
          calculatedPaymentCents
        });
        
        // Validate simplified flow data
        if (!paymentMethod || !paymentFrequency || !calculatedPaymentCents) {
          return res.status(400).json({ 
            success: false,
            message: "Invalid payment arrangement data" 
          });
        }
        
        // For term-based method, require selectedTerm
        if (paymentMethod === 'term' && !selectedTerm) {
          return res.status(400).json({ 
            success: false,
            message: "Please select a payment term (3, 6, or 12 months)" 
          });
        }
        
        // Use the calculated payment amount
        amountCents = calculatedPaymentCents;
        
        // Store simplified arrangement data for payment schedule creation
        simplifiedArrangementData = {
          paymentMethod,
          selectedTerm,
          paymentFrequency,
          amountCents: calculatedPaymentCents
        };
        
        console.log('✅ Simplified flow validated:', simplifiedArrangementData);
      }
      
      // CRITICAL: If customPaymentAmountCents is provided WITHOUT an arrangement
      // (e.g., SMAX arrangement payments), use it instead of full balance
      // Also detect this as an SMAX arrangement payment for event handling
      const isSmaxArrangementPayment = !!account.filenumber && !!customPaymentAmountCents && !arrangementId && !isSimplifiedFlow;
      
      if (!isSimplifiedFlow && !arrangementId && customPaymentAmountCents && customPaymentAmountCents > 0) {
        amountCents = customPaymentAmountCents;
        console.log('💰 Using custom payment amount (SMAX arrangement):', {
          customPaymentAmountCents,
          amountDollars: (customPaymentAmountCents / 100).toFixed(2),
          originalBalance: account.balanceCents,
          isSmaxArrangementPayment
        });
      }
      
      if (arrangementId) {
        const arrangements = await storage.getArrangementOptionsByTenant(tenantId);
        console.log('📋 Available arrangements:', {
          count: arrangements.length,
          arrangementIds: arrangements.map(a => a.id),
          requestedId: arrangementId
        });
        
        arrangement = arrangements.find(arr => arr.id === arrangementId);
        
        if (!arrangement) {
          console.log('❌ Arrangement not found:', { arrangementId, availableIds: arrangements.map(a => a.id) });
          return res.status(400).json({ message: "Invalid arrangement selected" });
        }

        console.log('✅ Arrangement found:', {
          id: arrangement.id,
          name: arrangement.name,
          planType: arrangement.planType,
          minBalance: arrangement.minBalance,
          maxBalance: arrangement.maxBalance
        });

        // Validate account balance is within arrangement's min/max range
        const accountBalance = account.balanceCents || 0;
        if (accountBalance < arrangement.minBalance || accountBalance > arrangement.maxBalance) {
          console.log('❌ Account balance outside arrangement range:', {
            accountBalance,
            minBalance: arrangement.minBalance,
            maxBalance: arrangement.maxBalance
          });
          return res.status(400).json({ 
            success: false,
            message: "This payment plan is not available for your current balance" 
          });
        }

        if (arrangement.planType === 'settlement' && requestedSettlementPaymentCount) {
          const validCounts = arrangement.settlementPaymentCounts || [1];
          const requestedCount = Number(requestedSettlementPaymentCount);
          if (validCounts.includes(requestedCount)) {
            (arrangement as any).settlementPaymentCount = requestedCount;
            console.log('📋 Settlement payment count set from request:', requestedCount);
          } else {
            (arrangement as any).settlementPaymentCount = validCounts[0] || 1;
            console.log('⚠️ Requested settlement count not in valid options, using default:', validCounts[0] || 1);
          }
        } else if (arrangement.planType === 'settlement') {
          const validCounts = arrangement.settlementPaymentCounts || [1];
          (arrangement as any).settlementPaymentCount = validCounts[0] || 1;
          console.log('📋 Settlement payment count defaulted to:', validCounts[0] || 1);
        }

        // Calculate payment amount based on arrangement type
        console.log('💰 Calculating payment amount for arrangement type:', arrangement.planType);
        
        // If customPaymentAmountCents is provided (e.g., frequency-adjusted amount from frontend), use it
        // Skip for settlements and one_time_payments - these have their own amount calculation logic
        if (customPaymentAmountCents && customPaymentAmountCents > 0 && arrangement.planType !== 'one_time_payment' && arrangement.planType !== 'settlement') {
          // Validate the custom amount is within acceptable range for this arrangement
          const minAmount = arrangement.planType === 'range' 
            ? (arrangement.monthlyPaymentMin || 0)
            : arrangement.planType === 'fixed_monthly'
              ? (arrangement.fixedMonthlyPayment || 0)
              : 0;
          
          // For weekly/biweekly payments, the amount can be less than monthly min
          // So we only validate it's positive and not more than balance
          if (customPaymentAmountCents > accountBalance) {
            console.log('❌ Custom payment exceeds balance:', { customPaymentAmountCents, accountBalance });
            return res.status(400).json({ 
              success: false,
              message: `Payment amount cannot exceed your balance of $${(accountBalance / 100).toFixed(2)}` 
            });
          }
          
          amountCents = customPaymentAmountCents;
          console.log('✅ Using custom payment amount from frontend:', {
            customAmount: customPaymentAmountCents,
            customAmountDollars: (customPaymentAmountCents / 100).toFixed(2),
            arrangementType: arrangement.planType
          });
        } else if (arrangement.planType === 'one_time_payment') {
          // One-time payment: use custom amount provided by consumer
          if (!customPaymentAmountCents || customPaymentAmountCents <= 0) {
            console.log('❌ Invalid custom payment amount:', customPaymentAmountCents);
        });
      }

      // Calculate costs using tenant pricing (or defaults)
      const userPrice = tenant.voipUserPrice || 8000; // $80
      const localDidPrice = tenant.voipLocalDidPrice || 500; // $5
      const tollFreePrice = tenant.voipTollFreePrice || 1000; // $10

      const usersCost = voipUserCount * userPrice;
      const localDidsCost = counts.localCount * localDidPrice;
      // Charge for all toll-free numbers
      const tollFreeCost = counts.tollFreeCount * tollFreePrice;
      const totalCost = usersCost + localDidsCost + tollFreeCost;

      res.json({
        billingOwner: "CHAIN",
        entitlementStatus: entitlement.status,
        legacyChainBillingSuppressed: false,
        voipEnabled: entitlement.allowed,
        voipUserCount,
        localDidCount: counts.localCount,
        tollFreeCount: counts.tollFreeCount,
        pricing: {
          userPriceCents: userPrice,
          localDidPriceCents: localDidPrice,
          tollFreePriceCents: tollFreePrice,
        },
        costs: {
          usersCostCents: usersCost,
          localDidsCostCents: localDidsCost,
          tollFreeCostCents: tollFreeCost,
          totalCostCents: totalCost,
        },
      });
    } catch (error) {
      console.error("Error getting VoIP billing summary:", error);
      res.status(500).json({ message: "Failed to get billing summary" });
    }
  });

  // Enable/disable VoIP for tenant
  app.post('/api/voip/enable', authenticateUser, requireOwner, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (!user.tenantId) {
        console.error("VoIP enable failed: user.tenantId is null or undefined", { userId: user.id });
        return res.status(400).json({ message: "Invalid tenant configuration. Please contact support." });
      }

      const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "enabled must be true or false" });

      await db.transaction(tx => setChainPhoneEntitlement(tx, user.tenantId, parsed.data.enabled));
      if (parsed.data.enabled) {
        res.json({ success: true, message: "VoIP enabled successfully. You can now add phone numbers from the Numbers tab." });
      } else {
        res.json({ success: true, message: "VoIP disabled" });
      }
    } catch (error) {
      if (error instanceof PhoneProductOwnershipConflictError) {
        return res.status(409).json({ message: error.message, code: "CHIAMO_BILLING_OWNER" });
      }
      console.error("Error enabling VoIP:", error);
      res.status(500).json({ message: "Failed to enable VoIP" });
    }
  });

  // Update VoIP phone number
  app.patch('/api/voip/phone-numbers/:id', authenticateUser, requireOwner, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;
      const { friendlyName, isPrimary, isActive, routingBucketId } = req.body;
      if (routingBucketId !== undefined && routingBucketId !== null && !(await voipStorage.getRoutingBucket(routingBucketId, user.tenantId))) {
        return res.status(400).json({ message: 'Routing bucket does not belong to this company' });
      }

      // If setting as primary, unset existing primary
      if (isPrimary) {
        const existingPrimary = await voipStorage.getPrimaryVoipPhoneNumber(user.tenantId);
        if (existingPrimary && existingPrimary.id !== id) {
          await voipStorage.updateVoipPhoneNumber(existingPrimary.id, user.tenantId, { isPrimary: false });
        }
      }

      const updated = await voipStorage.updateVoipPhoneNumber(id, user.tenantId, {
        friendlyName,
        isPrimary,
        isActive,
        ...(routingBucketId !== undefined ? { routingBucketId } : {}),
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating phone number:", error);
      res.status(500).json({ message: "Failed to update phone number" });
    }
  });

  // Set primary VoIP phone number
  app.put('/api/voip/phone-numbers/:id/primary', authenticateUser, requireOwner, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;

      // Unset any existing primary
      const existingPrimary = await voipStorage.getPrimaryVoipPhoneNumber(user.tenantId);
      if (existingPrimary && existingPrimary.id !== id) {
        await voipStorage.updateVoipPhoneNumber(existingPrimary.id, user.tenantId, { isPrimary: false });
      }

      const updated = await voipStorage.updateVoipPhoneNumber(id, user.tenantId, { isPrimary: true });

      res.json(updated);
    } catch (error) {
      console.error("Error setting primary phone number:", error);
      res.status(500).json({ message: "Failed to set primary phone number" });
    }
  });

  // Delete VoIP phone number
  app.delete('/api/voip/phone-numbers/:id', authenticateUser, requireOwner, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;
      const success = await voipStorage.deleteVoipPhoneNumber(id, user.tenantId);
      
      if (success) {
        res.json({ message: "Phone number deleted" });
      } else {
        res.status(404).json({ message: "Phone number not found" });
      }
    } catch (error) {
      console.error("Error deleting phone number:", error);
      res.status(500).json({ message: "Failed to delete phone number" });
    }
  });

  // Get call logs
  app.get('/api/voip/call-logs', authenticateUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Check VoIP access
      const isOwner = (user as any).role === 'owner' || (user as any).role === 'manager';
      if (!isOwner && !(user as any).voipAccess) {
        return res.status(403).json({ message: "VoIP access not enabled for this user" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const callLogs = await voipStorage.getVoipCallLogsByTenant(user.tenantId, limit, offset);
      res.json(callLogs);
    } catch (error) {
      console.error("Error getting call logs:", error);
      res.status(500).json({ message: "Failed to get call logs" });
    }
  });

  // Get call logs for a specific consumer
  app.get('/api/voip/call-logs/consumer/:consumerId', authenticateUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { consumerId } = req.params;
      const callLogs = await voipStorage.getVoipCallLogsByConsumer(consumerId, user.tenantId);
      res.json(callLogs);
    } catch (error) {
      console.error("Error getting consumer call logs:", error);
      res.status(500).json({ message: "Failed to get call logs" });
    }
  });

  app.get('/api/voip/held-calls', authenticateUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      if (!canUseSoftphone(user)) return res.status(403).json({ message: 'VoIP access not enabled for this user' });
      await cleanupExpiredSuspendedCalls();
      const [heldCall] = await db.select().from(voipSuspendedCalls).where(and(
        eq(voipSuspendedCalls.tenantId, user.tenantId),
        eq(voipSuspendedCalls.kind, 'HOLD'),
        eq(voipSuspendedCalls.status, 'ACTIVE'),
        eq(voipSuspendedCalls.createdByUserId, user.id),
        gt(voipSuspendedCalls.expiresAt, new Date()),
      )).orderBy(desc(voipSuspendedCalls.createdAt)).limit(1);
      res.json(heldCall ? {
        id: heldCall.id,
        callerName: heldCall.callerName,
        callerNumber: heldCall.callerNumber,
        heldAt: heldCall.createdAt,
      } : null);
    } catch (error) {
      console.error('Error getting held call:', error);
      res.status(500).json({ message: 'Failed to get held call' });
    }
  });

  app.post('/api/voip/held-calls', authenticateUser, async (req, res) => {
    let retainedCallSid = '';
    let recovery: { tenantId: string; userId: string } | null = null;
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      if (!canUseSoftphone(user)) return res.status(403).json({ message: 'VoIP access not enabled for this user' });
      const { activeCallSid, callerName, callerNumber } = req.body;
      if (!activeCallSid || !callerNumber) return res.status(400).json({ message: 'Active call and caller number are required' });
      await cleanupExpiredSuspendedCalls();
      const settings = await voipStorage.getVoiceSettings(user.tenantId);
      retainedCallSid = await suspendLiveVoipCall(user.tenantId, user.id, activeCallSid, settings?.holdMusicKey || 'art-gallery-museum');
      recovery = { tenantId: user.tenantId, userId: user.id };
      const [heldCall] = await db.insert(voipSuspendedCalls).values({
        tenantId: user.tenantId,
        kind: 'HOLD',
        activeCallSid,
        retainedCallSid,
        createdByUserId: user.id,
        callerName: callerName || '',
        callerNumber,
        expiresAt: new Date(Date.now() + suspendedCallExpiryMs),
      }).returning();
      res.json({ id: heldCall.id, callerName: heldCall.callerName, callerNumber, heldAt: heldCall.createdAt });
    } catch (error) {
      console.error('Error placing call on hold:', error);
      if (retainedCallSid && recovery) {
        await reconnectSuspendedVoipCall(recovery.tenantId, retainedCallSid, recovery.userId).catch(() => undefined);
      }
      res.status(502).json({ message: 'The live call could not be placed on hold' });
    }
  });

  app.post('/api/voip/held-calls/:id/resume', authenticateUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      if (!canUseSoftphone(user)) return res.status(403).json({ message: 'VoIP access not enabled for this user' });
      await cleanupExpiredSuspendedCalls();
      const [heldCall] = await db.update(voipSuspendedCalls).set({ status: 'RESUMING', updatedAt: new Date() }).where(and(
        eq(voipSuspendedCalls.id, req.params.id),
        eq(voipSuspendedCalls.tenantId, user.tenantId),
        eq(voipSuspendedCalls.kind, 'HOLD'),
        eq(voipSuspendedCalls.status, 'ACTIVE'),
        eq(voipSuspendedCalls.createdByUserId, user.id),
        gt(voipSuspendedCalls.expiresAt, new Date()),
      )).returning();
      if (!heldCall) return res.status(404).json({ message: 'Held call not found' });
      try {
        await reconnectSuspendedVoipCall(user.tenantId, heldCall.retainedCallSid, user.id);
        await db.update(voipSuspendedCalls).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(voipSuspendedCalls.id, heldCall.id));
      } catch (error) {
        await db.update(voipSuspendedCalls).set({ status: 'ACTIVE', updatedAt: new Date() }).where(eq(voipSuspendedCalls.id, heldCall.id));
        throw error;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error resuming held call:', error);
      res.status(502).json({ message: 'The held call could not be resumed' });
    }
  });

  // Shared parked call list for softphone users. This exposes parked calls to every
  // VoIP-enabled user in the tenant so any person can pick one up from the phone UI.
  app.get('/api/voip/parked-calls', authenticateUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!canUseSoftphone(user)) return res.status(403).json({ message: 'VoIP access not enabled for this user' });
      await cleanupExpiredSuspendedCalls();
      const tenantParkedCalls = await db.select().from(voipSuspendedCalls).where(and(
        eq(voipSuspendedCalls.tenantId, user.tenantId),
        eq(voipSuspendedCalls.kind, 'PARK'),
        eq(voipSuspendedCalls.status, 'ACTIVE'),
        gt(voipSuspendedCalls.expiresAt, new Date()),
      )).orderBy(voipSuspendedCalls.createdAt);
      res.json(tenantParkedCalls.map(call => ({
        id: call.id,
        callerName: call.callerName,
        callerNumber: call.callerNumber,
        parkedBy: call.parkedBy,
        parkedAt: call.createdAt,
      })));
    } catch (error) {
      console.error("Error getting parked calls:", error);
      res.status(500).json({ message: "Failed to get parked calls" });
    }
  });

  app.post('/api/voip/parked-calls', authenticateUser, async (req, res) => {
    let retainedCallSid = '';
    let recovery: { tenantId: string; userId: string } | null = null;
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!canUseSoftphone(user)) {
        return res.status(403).json({ message: "VoIP access not enabled for this user" });
      }

      const { activeCallSid, callerName, callerNumber } = req.body;
      if (!activeCallSid || !callerNumber) {
        return res.status(400).json({ message: "Active call and caller number are required" });
      }

      await cleanupExpiredSuspendedCalls();
      const settings = await voipStorage.getVoiceSettings(user.tenantId);
      retainedCallSid = await suspendLiveVoipCall(user.tenantId, user.id, activeCallSid, settings?.parkMusicKey || 'art-gallery-museum');
      recovery = { tenantId: user.tenantId, userId: user.id };
      const [parkedCall] = await db.insert(voipSuspendedCalls).values({
        tenantId: user.tenantId,
        kind: 'PARK',
        activeCallSid,
        retainedCallSid,
        createdByUserId: user.id,
        callerName: callerName || '',
        callerNumber,
        parkedBy: (user as any).name || (user as any).username || 'Another agent',
        expiresAt: new Date(Date.now() + suspendedCallExpiryMs),
      }).returning();
      res.json({
        id: parkedCall.id,
        callerName: parkedCall.callerName,
        callerNumber: parkedCall.callerNumber,
        parkedBy: parkedCall.parkedBy,
        parkedAt: parkedCall.createdAt,
      });
    } catch (error) {
      console.error("Error parking call:", error);
      if (retainedCallSid && recovery) {
        await reconnectSuspendedVoipCall(recovery.tenantId, retainedCallSid, recovery.userId).catch(() => undefined);
      }
      res.status(500).json({ message: "Failed to park call" });
    }
  });

  app.post('/api/voip/parked-calls/:id/pickup', authenticateUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!canUseSoftphone(user)) return res.status(403).json({ message: 'VoIP access not enabled for this user' });
      await cleanupExpiredSuspendedCalls();
      const [parkedCall] = await db.update(voipSuspendedCalls).set({ status: 'RESUMING', updatedAt: new Date() }).where(and(
        eq(voipSuspendedCalls.id, req.params.id),
        eq(voipSuspendedCalls.tenantId, user.tenantId),
        eq(voipSuspendedCalls.kind, 'PARK'),
        eq(voipSuspendedCalls.status, 'ACTIVE'),
        gt(voipSuspendedCalls.expiresAt, new Date()),
      )).returning();
      if (!parkedCall) return res.status(404).json({ message: "Parked call not found" });
      try {
        await reconnectSuspendedVoipCall(user.tenantId, parkedCall.retainedCallSid, user.id);
        await db.update(voipSuspendedCalls).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(voipSuspendedCalls.id, parkedCall.id));
      } catch (error) {
        await db.update(voipSuspendedCalls).set({ status: 'ACTIVE', updatedAt: new Date() }).where(eq(voipSuspendedCalls.id, parkedCall.id));
        throw error;
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error picking up parked call:", error);
      res.status(500).json({ message: "Failed to pick up parked call" });
    }
  });

  // Initiate an outbound call
  app.post('/api/voip/call', authenticateUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Check VoIP access
      const isOwner = user.role === 'owner' || user.role === 'manager';
      if (!isOwner && !user.voipAccess) {
        return res.status(403).json({ message: "VoIP access not enabled for this user" });
      }

      const { toNumber, consumerId, accountId, selectedNumberId: requestedNumberId, callerIdMode } = req.body;

      if (!toNumber) {
        return res.status(400).json({ message: "Phone number to call is required" });
      }

      const allNumbers = await voipStorage.getVoipPhoneNumbersByTenant(user.tenantId);
      const selectedNumberId = requestedNumberId
        || (callerIdMode === 'office' ? allNumbers.find(number => number.numberType === 'TOLL_FREE' && number.isActive)?.id : undefined);
      if (consumerId) {
        const [owned] = await db.select({ id: consumers.id }).from(consumers).where(and(eq(consumers.id, consumerId), eq(consumers.tenantId, user.tenantId))).limit(1);
        if (!owned) return res.status(400).json({ message: "Consumer does not belong to this company" });
      }
      if (accountId) {
        const [owned] = await db.select({ id: accountsTable.id }).from(accountsTable).where(and(eq(accountsTable.id, accountId), eq(accountsTable.tenantId, user.tenantId))).limit(1);
        if (!owned) return res.status(400).json({ message: "Account does not belong to this company" });
      }
      const packages = await db.select({ geographies: localPresencePackages.geographies }).from(localPresencePackages).where(eq(localPresencePackages.status, 'ACTIVE'));
      const areaStates = new Map<string, string>();
      for (const pkg of packages) for (const geo of pkg.geographies || []) areaStates.set(geo.areaCode, geo.state);
      const { selectDialingNumber } = await import('./localPresenceService');
      const decision = selectDialingNumber({
        tenantId: user.tenantId,
        dialString: toNumber,
        numbers: allNumbers as any,
        selectedNumberId,
        areaCodeToState: areaCode => areaStates.get(areaCode),
      });
      const fromPhoneNumber = decision.selectedNumber;
      const privateCallerId = decision.selectionReason === 'PRIVATE_FALLBACK' || callerIdMode === 'PRIVATE' || callerIdMode === 'private';

      // Create call log entry
      const callLog = await voipStorage.createVoipCallLog({
        tenantId: user.tenantId,
        consumerId: consumerId || null,
        accountId: accountId || null,
        agentCredentialId: user.credentialId || null,
        direction: 'outbound',
        fromNumber: privateCallerId ? 'anonymous' : fromPhoneNumber.phoneNumber,
        toNumber: decision.destination,
        status: 'initiated',
        startedAt: new Date(),
      });
      const jwt = (await import('jsonwebtoken')).default;
      const selectionToken = jwt.sign({
        purpose: 'voice-call-selection',
        tenantId: user.tenantId,
        callLogId: callLog.id,
        destination: decision.destination,
        callerId: privateCallerId ? 'anonymous' : fromPhoneNumber.phoneNumber,
        callerIdMode: privateCallerId ? 'PRIVATE' : 'NUMBER',
      }, process.env.JWT_SECRET!, { expiresIn: '5m' });

      res.json({
        callLogId: callLog.id,
        selectionToken,
        fromNumber: privateCallerId ? 'anonymous' : fromPhoneNumber.phoneNumber,
        actualFromNumber: privateCallerId ? 'anonymous' : fromPhoneNumber.phoneNumber,
        toNumber: decision.destination,
        status: 'initiated',
        localPresenceRequested: decision.localPresenceRequested,
        selectionReason: decision.selectionReason,
        isPrivate: privateCallerId,
        message: 'Call initiated. Use the Twilio Voice SDK to handle the call.'
      });
    } catch (error) {
      console.error("Error initiating call:", error);
      res.status(500).json({ message: "Failed to initiate call" });
    }
  });

  // Update call log (for notes)
  app.patch('/api/voip/call-logs/:id', authenticateUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;
      const { notes, consumerId, accountId } = req.body;

      const callLog = await voipStorage.getVoipCallLogById(id, user.tenantId);
      if (!callLog) {
        return res.status(404).json({ message: "Call log not found" });
      }

      const updated = await voipStorage.updateVoipCallLog(id, user.tenantId, {
        notes,
        consumerId: consumerId || callLog.consumerId,
        accountId: accountId || callLog.accountId,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating call log:", error);
      res.status(500).json({ message: "Failed to update call log" });
    }
  });

  // TwiML endpoint for outbound calls (called by Twilio)
  const validateTwilioVoiceSignature = async (req: any, res: any, next: any) => {
    const signature = req.header('x-twilio-signature');
    const accountSid = req.body?.AccountSid;
    const forwardedProto = String(req.header('x-forwarded-proto') || req.protocol).split(',')[0].trim();
    const forwardedHost = String(req.header('x-forwarded-host') || req.header('host') || '').split(',')[0].trim();
    const configuredOrigin = process.env.TWILIO_VOICE_WEBHOOK_BASE_URL || process.env.PUBLIC_APP_URL || process.env.APP_URL;
    const publicUrl = configuredOrigin ? `${configuredOrigin.replace(/\/$/, '')}${req.originalUrl}` : `${forwardedProto}://${forwardedHost}${req.originalUrl}`;
    const { decryptCredential } = await import('./credentialCrypto');
    const { verifyTwilioVoiceWebhook } = await import('./voiceWebhookSecurity');
    const tenantId = await verifyTwilioVoiceWebhook({
      signature,
      publicUrl,
      params: req.body || {},
      accountSid,
      resolveCredential: async sid => {
        const [company] = await db.select({ id: tenants.id, authToken: tenants.twilioAuthToken })
          .from(tenants).where(eq(tenants.twilioAccountSid, sid)).limit(1);
        return company?.authToken
          ? { tenantId: company.id, authToken: decryptCredential(company.authToken) }
          : null;
      },
    });
    if (!tenantId) return res.status(403).send('Invalid Twilio signature or account');
    req.twilioTenantId = tenantId;
    next();
  };

  app.post('/api/voice/outbound', validateTwilioVoiceSignature, async (req, res) => {
    try {
      const { SelectionToken, CallSid } = req.body;
      const clientTenantId = (req as any).twilioTenantId as string | undefined;
      if (clientTenantId) {
        const { getChiamoPhoneSystemAccess } = await import('./chiamoAccess');
        const access = await getChiamoPhoneSystemAccess(clientTenantId);
        if (access.isChiamo && !access.allowed) {
          res.type('text/xml');
          return res.send('<Response><Say>Your Chiamo phone system is not active.</Say><Hangup/></Response>');
        }
      }
      if (!clientTenantId) {
        res.type('text/xml');
        return res.status(403).send('<Response><Say>Unauthorized caller identity.</Say><Hangup/></Response>');
      }

      // Never trust a client-supplied From as caller ID. Select only from this
      // authenticated identity's tenant inventory.
      const jwt = (await import('jsonwebtoken')).default;
      let selection: any;
      try {
        selection = jwt.verify(String(SelectionToken || ''), process.env.JWT_SECRET!);
      } catch {
        return res.status(403).send('<Response><Say>Invalid call authorization.</Say><Hangup/></Response>');
      }
      if (selection?.purpose !== 'voice-call-selection' || selection.tenantId !== clientTenantId) {
        return res.status(403).send('<Response><Say>Invalid call authorization.</Say><Hangup/></Response>');
      }
      const allNumbers = await voipStorage.getVoipPhoneNumbersByTenant(clientTenantId);
       const isPrivate = selection.callerIdMode === 'PRIVATE' && selection.callerId === 'anonymous';
       const callerId = isPrivate ? null : allNumbers.find(number => number.phoneNumber === selection.callerId && number.isActive);
       if (!isPrivate && !callerId) {
        res.type('text/xml');
        return res.status(409).send('<Response><Say>No active company caller ID is configured.</Say><Hangup/></Response>');
      }
      const bound = await voipStorage.bindVoipCallSid(selection.callLogId, clientTenantId, CallSid);
      if (!bound) return res.status(409).send('<Response><Say>Call authorization was already used.</Say><Hangup/></Response>');
      
      const { generateTwiML } = await import('./twilioVoiceService');
      
      // Generate TwiML to dial the number
      const twiml = generateTwiML({
        action: 'dial',
        to: selection.destination,
         from: isPrivate ? 'anonymous' : callerId!.phoneNumber,
        record: true,
      });

      res.type('text/xml');
      res.send(twiml);
    } catch (error) {
      console.error("Error generating TwiML for outbound call:", error);
      res.status(500).send('<Response><Say>An error occurred</Say></Response>');
    }
  });

  // TwiML endpoint for inbound calls (called by Twilio when someone calls your number)
  app.post('/api/voice/inbound', validateTwilioVoiceSignature, async (req, res) => {
    try {
      const { From, To, CallSid, AccountSid } = req.body;
      const validatedTenantId = (req as any).twilioTenantId as string;
      
      // Find the tenant that owns this phone number
      const tenantId = await voipStorage.getTenantByPhoneNumber(To);
      
      if (!tenantId || tenantId !== validatedTenantId) {
        console.error("No tenant found for phone number:", To);
        res.type('text/xml');
        res.send('<Response><Say>This number is not configured. Goodbye.</Say></Response>');
        return;
      }
      const ownedNumber = (await voipStorage.getVoipPhoneNumbersByTenant(tenantId))
        .find(number => number.phoneNumber === (To?.startsWith('+') ? To : `+1${String(To || '').replace(/\D/g, '')}`));
      if (!ownedNumber || !AccountSid || ownedNumber.twilioSubaccountSid !== AccountSid) {
        res.type('text/xml');
        return res.status(403).send('<Response><Say>Invalid provider account.</Say><Hangup/></Response>');
      }

      const { getChiamoPhoneSystemAccess } = await import('./chiamoAccess');
      const phoneAccess = await getChiamoPhoneSystemAccess(tenantId);
      if (phoneAccess.isChiamo && !phoneAccess.allowed) {
        res.type('text/xml');
        return res.send('<Response><Say>This phone system is not currently active.</Say><Hangup/></Response>');
      }

      const credentials = await storage.getAgencyCredentialsByTenant(tenantId);
      const configuredBucket = ownedNumber.routingBucketId
        ? await voipStorage.getRoutingBucket(ownedNumber.routingBucketId, tenantId)
        : undefined;
      const bucket = configuredBucket?.isActive ? configuredBucket : undefined;
      const allowedAgentIds = bucket?.agentCredentialIds?.length
        ? new Set(bucket.agentCredentialIds)
        : null;
      const voipAgents = credentials.filter(c => c.voipAccess === true && c.isActive === true && (!allowedAgentIds || allowedAgentIds.has(c.id)));
      
      // Create call log for this inbound call
      const { formatPhoneE164 } = await import('./twilioVoiceService');
      await voipStorage.createVoipCallLog({
        tenantId,
        agentCredentialId: null, // Will be updated when agent answers
        callSid: CallSid,
        direction: 'inbound',
        fromNumber: formatPhoneE164(From),
        toNumber: formatPhoneE164(To),
        status: 'ringing',
      });

      const settings = await voipStorage.getVoiceSettings(tenantId);
      const { voiceWebhookBaseUrl } = await import('./companyTwilioService');
      const { createGreetingPlaybackUrl } = await import('./voiceMediaTokens');
      const { buildInboundTwiML } = await import('./voiceInboundRouting');
      const callbackBase = voiceWebhookBaseUrl();
      const twiml = buildInboundTwiML({
        tenantId,
        callSid: CallSid,
        bucketId: bucket?.id,
        mode: bucket?.mode === 'VOICEMAIL' ? 'VOICEMAIL' : 'RING_TEAM',
        agentIds: voipAgents.map(agent => agent.id),
        timeoutSeconds: bucket?.ringTimeoutSeconds || 30,
        greeting: {
          enabled: settings?.inboundGreetingEnabled === true,
          type: settings?.inboundGreetingType || null,
          text: settings?.inboundGreetingText,
          audioUrl: settings?.inboundGreetingAudioUrl
            ? createGreetingPlaybackUrl(process.env.JWT_SECRET!, callbackBase, settings.inboundGreetingAudioUrl)
            : null,
        },
        callbackBase,
      });

      res.type('text/xml');
      res.send(twiml);
    } catch (error) {
      console.error("Error handling inbound call:", error);
      res.type('text/xml');
      res.send('<Response><Say>An error occurred. Please try again later.</Say></Response>');
    }
  });

  app.post('/api/voice/inbound-voicemail', validateTwilioVoiceSignature, async (req, res) => {
    const tenantId = (req as any).twilioTenantId as string;
    const requestedBucket = typeof req.query.bucketId === 'string'
      ? await voipStorage.getRoutingBucket(req.query.bucketId, tenantId)
      : undefined;
    const { voiceWebhookBaseUrl } = await import('./companyTwilioService');
    const { buildVoicemailTwiML } = await import('./voiceInboundRouting');
    res.type('text/xml').send(buildVoicemailTwiML({ bucketId: requestedBucket?.id, callbackBase: voiceWebhookBaseUrl() }));
  });

  app.post('/api/voice/voicemail-complete', validateTwilioVoiceSignature, async (_req, res) => {
    const { buildVoicemailCompleteTwiML } = await import('./voiceInboundRouting');
    res.type('text/xml').send(buildVoicemailCompleteTwiML());
  });

  app.post('/api/voice/voicemail-recording', validateTwilioVoiceSignature, async (req, res) => {
    const tenantId = (req as any).twilioTenantId as string;
    const { CallSid, RecordingSid, RecordingUrl, RecordingStatus, RecordingDuration, From, To } = req.body;
    const requestedBucket = typeof req.query.bucketId === 'string'
      ? await voipStorage.getRoutingBucket(req.query.bucketId, tenantId)
      : undefined;
    const ownedNumbers = await voipStorage.getVoipPhoneNumbersByTenant(tenantId);
    const normalizedTo = String(To || '').startsWith('+') ? String(To) : `+1${String(To || '').replace(/\D/g, '')}`;
    const phone = ownedNumbers.find(number => number.phoneNumber === normalizedTo);
    if (!phone || !CallSid || !RecordingSid) return res.status(400).send('Invalid voicemail callback');
    await db.insert(voipVoicemails).values({
      tenantId,
      routingBucketId: requestedBucket?.id || phone.routingBucketId || null,
      phoneNumberId: phone.id,
      callSid: CallSid,
      recordingSid: RecordingSid,
      recordingUrl: RecordingUrl ? `${RecordingUrl}.mp3` : null,
      fromNumber: String(From || 'anonymous'),
      toNumber: phone.phoneNumber,
      duration: Number.parseInt(RecordingDuration, 10) || 0,
      status: RecordingStatus === 'completed' ? 'READY' : String(RecordingStatus || 'PROCESSING').toUpperCase(),
    }).onConflictDoUpdate({
      target: [voipVoicemails.tenantId, voipVoicemails.callSid],
      set: {
        recordingSid: RecordingSid, recordingUrl: RecordingUrl ? `${RecordingUrl}.mp3` : null,
        duration: Number.parseInt(RecordingDuration, 10) || 0,
        status: RecordingStatus === 'completed' ? 'READY' : String(RecordingStatus || 'PROCESSING').toUpperCase(),
        updatedAt: new Date(),
      },
    });
    res.sendStatus(204);
  });

  // Dial status callback (called by Twilio when dial attempt completes)
  app.post('/api/voice/dial-status', validateTwilioVoiceSignature, async (req, res) => {
    try {
      const { CallSid, DialCallStatus, DialCallSid } = req.body;
      console.log("Dial status callback:", { CallSid, DialCallStatus, DialCallSid });
      
      // Update call log based on dial outcome
      const tenantId = (req as any).twilioTenantId as string;
      const callLog = await voipStorage.getVoipCallLogByCallSid(CallSid, tenantId);
      if (callLog) {
        if (DialCallStatus === 'completed' || DialCallStatus === 'answered') {
          await voipStorage.updateVoipCallLog(callLog.id, tenantId, { status: 'completed', answeredAt: new Date() });
        } else if (DialCallStatus === 'no-answer' || DialCallStatus === 'busy' || DialCallStatus === 'failed') {
          await voipStorage.updateVoipCallLog(callLog.id, tenantId, { status: DialCallStatus, endedAt: new Date() });
        }
      }
      
      res.type('text/xml');
      if (['no-answer', 'busy', 'failed', 'canceled'].includes(DialCallStatus)) {
        const requestedBucket = typeof req.query.bucketId === 'string'
          ? await voipStorage.getRoutingBucket(req.query.bucketId, tenantId)
          : undefined;
        const { voiceWebhookBaseUrl } = await import('./companyTwilioService');
        const { buildVoicemailTwiML } = await import('./voiceInboundRouting');
        return res.send(buildVoicemailTwiML({ bucketId: requestedBucket?.id, callbackBase: voiceWebhookBaseUrl() }));
      }
      res.send('<Response/>');
    } catch (error) {
      console.error("Error handling dial status callback:", error);
      res.sendStatus(500);
    }
  });

  // Call status callback (called by Twilio during call lifecycle)
  app.post('/api/voice/call-status', validateTwilioVoiceSignature, async (req, res) => {
    try {
      const { CallSid, CallStatus, Duration, From, To, Timestamp } = req.body;

      // Update call log with status
      const tenantId = (req as any).twilioTenantId as string;
      const callLog = await voipStorage.getVoipCallLogByCallSid(CallSid, tenantId);
      if (callLog) {
        const updates: any = {
          status: CallStatus,
        };

        if (CallStatus === 'in-progress') {
          updates.answeredAt = new Date();
        } else if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(CallStatus)) {
          updates.endedAt = new Date();
          if (Duration) {
            updates.duration = parseInt(Duration);
          }
        }

        await voipStorage.updateVoipCallLog(callLog.id, tenantId, updates);
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("Error handling call status callback:", error);
      res.sendStatus(500);
    }
  });

  // Recording status callback (called by Twilio when recording is ready)
  app.post('/api/voice/recording-status', validateTwilioVoiceSignature, async (req, res) => {
    try {
      const { CallSid, RecordingSid, RecordingUrl, RecordingStatus, RecordingDuration } = req.body;

      // Update call log with recording info
      const tenantId = (req as any).twilioTenantId as string;
      const callLog = await voipStorage.getVoipCallLogByCallSid(CallSid, tenantId);
      if (callLog) {
        await voipStorage.updateVoipCallLog(callLog.id, tenantId, {
          recordingSid: RecordingSid,
          recordingUrl: `${RecordingUrl}.mp3`,
          recordingStatus: RecordingStatus,
          recordingDuration: parseInt(RecordingDuration) || 0,
        });
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("Error handling recording status callback:", error);
      res.sendStatus(500);
    }
  });

  // Get recording playback URL
  app.get('/api/voip/recording/:recordingSid', authenticateUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Check VoIP access
      const isOwner = user.role === 'owner' || user.role === 'manager';
      if (!isOwner && !user.voipAccess) {
        return res.status(403).json({ message: "VoIP access not enabled for this user" });
      }

      const { recordingSid } = req.params;
      
      // Verify the recording belongs to a call from this tenant
      const callLogs = await voipStorage.getVoipCallLogsByTenant(user.tenantId, 1000, 0);
      const callLog = callLogs.find(log => log.recordingSid === recordingSid);
      if (!callLog) {
        return res.status(404).json({ message: "Recording not found" });
      }
      
      const { getRecordingUrl } = await import('./twilioVoiceService');
      const url = await getRecordingUrl(user.tenantId, recordingSid);

      if (!url) {
        return res.status(404).json({ message: "Recording not found" });
      }

      res.json({ url });
    } catch (error) {
      console.error("Error getting recording:", error);
      res.status(500).json({ message: "Failed to get recording" });
    }
  });

  // End an active call
  app.post('/api/voip/hangup/:callSid', authenticateUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Check VoIP access
      const isOwner = user.role === 'owner' || user.role === 'manager';
      if (!isOwner && !user.voipAccess) {
        return res.status(403).json({ message: "VoIP access not enabled for this user" });
      }

      const { callSid } = req.params;
      
      // Verify the call belongs to this tenant
      const callLog = await voipStorage.getVoipCallLogByCallSid(callSid, user.tenantId);
      if (!callLog) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      const { hangupCall } = await import('./twilioVoiceService');
      const success = await hangupCall(user.tenantId, callSid);

      if (success) {
        res.json({ message: "Call ended" });
      } else {
        res.status(500).json({ message: "Failed to end call" });
      }
    } catch (error) {
      console.error("Error ending call:", error);
      res.status(500).json({ message: "Failed to end call" });
    }
  });

  registerWalletRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
