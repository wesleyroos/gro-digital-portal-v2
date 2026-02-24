-- Restore amountDue from totalAmount for paid invoices that were incorrectly zeroed
UPDATE `invoices` SET `amountDue` = `totalAmount` WHERE `status` = 'paid' AND `amountDue` = 0;
