import React, { useState, useEffect, useRef } from "react"
import { gql, useMutation } from "@apollo/client"

import Invoice from "./invoice"

type OperationError = {
  message: string
}

type LnInvoiceObject = {
  paymentRequest: string
}

const LN_INVOICE_CREATE_ON_BEHALF_OF_RECIPIENT = gql`
  mutation lnInvoiceCreateOnBehalfOfRecipient($walletId: WalletId!, $amount: SatAmount!) {
    mutationData: lnInvoiceCreateOnBehalfOfRecipient(
      input: { recipientWalletId: $walletId, amount: $amount }
    ) {
      errors {
        message
      }
      invoice {
        paymentRequest
      }
    }
  }
`

const INVOICE_STALE_CHECK_INTERVAL = 5 * 60 * 1000
const INVOICE_EXPIRE_INTERVAL = 60 * 60 * 1000

function GenerateInvoice({
  recipientWalletId,
  amountInSats,
  regenerate,
  currency,
}: {
  recipientWalletId: string
  amountInSats: number
  regenerate: () => void
  currency: string
}) {
  const [invoiceStatus, setInvoiceStatus] = useState<
    "loading" | "new" | "need-update" | "expired"
  >("loading")

  const timerIds = useRef<number[]>([])

  const [createInvoice, { loading, error, data }] = useMutation<{
    mutationData: {
      errors: OperationError[]
      invoice?: LnInvoiceObject
    }
  }>(LN_INVOICE_CREATE_ON_BEHALF_OF_RECIPIENT, {
    onError: console.error,
    onCompleted: () => setInvoiceStatus("new"),
  })

  const clearAllTimers = () => {
    timerIds.current.forEach((timerId) => clearTimeout(timerId))
  }

  useEffect(() => {
    createInvoice({
      variables: { walletId: recipientWalletId, amount: amountInSats },
    })
    if (currency !== "SATS") {
      timerIds.current.push(
        window.setTimeout(
          () => setInvoiceStatus("need-update"),
          INVOICE_STALE_CHECK_INTERVAL,
        ),
      )
    }
    timerIds.current.push(
      window.setTimeout(() => setInvoiceStatus("expired"), INVOICE_EXPIRE_INTERVAL),
    )
    return clearAllTimers
  }, [recipientWalletId, amountInSats, currency, createInvoice])

  let errorString: string | null = error?.message || null
  let invoice

  if (data) {
    const invoiceData = data.mutationData
    if (invoiceData.errors?.length > 0) {
      errorString = invoiceData.errors.map((e) => e.message).join(", ")
    } else {
      invoice = invoiceData.invoice
    }
  }

  if (errorString) {
    return <div className="error">{errorString}</div>
  }

  if (loading) {
    return <div className="loading">Creating Invoice...</div>
  }

  if (!invoice) return null

  if (invoiceStatus === "expired") {
    return (
      <div className="warning expired-invoice">
        Invoice Expired...{" "}
        <span className="clickable" onClick={regenerate}>
          Generate New Invoice
        </span>
      </div>
    )
  }

  return (
    <>
      {invoiceStatus === "need-update" && (
        <div className="warning">
          Stale Price...{" "}
          <span className="clickable" onClick={regenerate}>
            Regenerate Invoice
          </span>
        </div>
      )}
      <Invoice
        paymentRequest={invoice.paymentRequest}
        onPaymentSuccess={clearAllTimers}
      />
    </>
  )
}

export default GenerateInvoice
